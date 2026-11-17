"""Serving code for the Stage 1 sepsis early-warning models (ICU data; HR, O2Sat, Temp, Resp + age + gender).

Hand-ported from stage1_icu_4vitals/pipeline.py, which is the source of truth for preprocessing and model shapes:
range cleaning, forward-fill from the past only, training-median fill for leading gaps, z-scoring with the mean/SD of
measured values, a 6-hour window, and the static [scaled age, gender] appended to every hour. If pipeline.py changes
(or the models are retrained), change this file to match. Research prototype, not a diagnostic tool."""
import csv, json, math
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn

MAX_ROWS = 336                      # longest stay in the training data
DISCLAIMER = ("Research prototype trained on retrospective PhysioNet/CinC 2019 data. "
              "Not a diagnostic tool and not clinically validated; do not use for patient care decisions.")
HERE = Path(__file__).resolve().parent


def make_windows(F, rows, W):
    """Windows [len(rows), W, k] ending at each row; NaN where the window runs before the stay begins."""
    idx = rows[:, None] + np.arange(-W + 1, 1)[None, :]
    ok = idx >= 0
    out = F[np.clip(idx, 0, len(F) - 1)].copy()
    out[~ok] = np.nan
    return out, ok


def window_features(Z, OBS, S, W):
    """Tabular models: 8 statistics per vital over the window, then age and gender (same order as pipeline.py)."""
    rows = np.arange(len(Z))
    win, ok = make_windows(Z, rows, W)
    iw, _ = make_windows(OBS, rows, W)
    cur = win[:, -1]; mean = np.nanmean(win, 1); std = np.nanstd(win, 1); mn = np.nanmin(win, 1); mx = np.nanmax(win, 1)
    nv = ok.sum(1)[:, None]
    first = np.take_along_axis(win, np.argmax(ok, 1)[:, None, None].repeat(win.shape[2], 2), 1)[:, 0]
    slope = (cur - first) / np.maximum(nv - 1, 1)
    prev = np.where(nv > 1, win[:, -2], cur)
    delta = cur - np.nan_to_num(prev, nan=0.0)
    frac = np.nansum(iw, 1) / nv
    return np.concatenate([cur, mean, std, mn, mx, slope, delta, frac, S], 1).astype(np.float32)


class SeqClassifier(nn.Module):
    def __init__(self, n_in, hidden=64, layers=2, dropout=0.2, cell="lstm"):
        super().__init__()
        rnn = nn.LSTM if cell == "lstm" else nn.GRU
        self.rnn = rnn(n_in, hidden, num_layers=layers, batch_first=True, dropout=dropout if layers > 1 else 0.0)
        self.drop = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden, 1)
    def forward(self, x):
        h, _ = self.rnn(x)
        return self.fc(self.drop(h[:, -1])).squeeze(-1)

class Encoder(nn.Module):
    def __init__(self, n_in, hidden=64, latent=32):
        super().__init__()
        self.rnn = nn.LSTM(n_in, hidden, batch_first=True)
        self.to_z = nn.Linear(hidden, latent)
    def forward(self, x):
        h, _ = self.rnn(x)
        return self.to_z(h[:, -1])

class SepsisHead(nn.Module):
    def __init__(self, latent, hidden=64, dropout=0.2):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(latent, hidden), nn.ReLU(), nn.Dropout(dropout), nn.Linear(hidden, 1))
    def forward(self, z):
        return self.net(z).squeeze(-1)


class ModelHub:
    """Runs every model in artifacts/model_registry.json on the same preprocessed history."""
    def __init__(self, models_dir=None, artifacts_dir=None):
        self.models_dir = Path(models_dir or HERE / "models"); self.art = Path(artifacts_dir or HERE / "artifacts")
        self.cfg = json.load(open(self.art / "config.json")); pre = json.load(open(self.art / "preprocessing.json"))
        self.reg = json.load(open(self.art / "model_registry.json"))
        self.W, self.vitals, self.ranges = self.cfg["sequence_length"], self.cfg["vitals"], self.cfg["valid_ranges"]
        assert pre["vitals"] == self.vitals, "preprocessing.json and config.json disagree on the vitals"
        self.med = np.array(pre["median"], dtype=np.float32); self.mean = np.array(pre["mean"], dtype=np.float32)
        self.std = np.array(pre["std"], dtype=np.float32); self.age_mean, self.age_std = pre["age_mean"], pre["age_std"]
        self.primary = self.reg["primary"]; self.info = {m["key"]: m for m in self.reg["models"]}
        n_in = 2 * len(self.vitals) + 2 + 1                              # scaled vitals, measured flags, age, gender, valid
        self.nets = {}
        for m in self.reg["models"]:
            f = HERE / m["file"]; k = m["kind"]
            if k == "tabular_lr":
                import joblib; self.nets[m["key"]] = joblib.load(f)
            elif k == "tabular_xgb":
                import xgboost as xgb; net = xgb.XGBClassifier(); net.load_model(str(f)); self.nets[m["key"]] = net
            elif k in ("sequence_lstm", "sequence_gru"):
                net = SeqClassifier(n_in, 64, 2, 0.2, "lstm" if k.endswith("lstm") else "gru")
                net.load_state_dict(torch.load(f, map_location="cpu")); self.nets[m["key"]] = net.eval()
            else:
                ck = torch.load(f, map_location="cpu")
                enc = Encoder(n_in, 64, 32); enc.load_state_dict(ck["enc"]); head = SepsisHead(32); head.load_state_dict(ck["head"])
                self.nets[m["key"]] = (enc.eval(), head.eval())

    def _parse(self, history):
        if not isinstance(history, list) or not history:
            raise ValueError("input must contain a non-empty 'history' list of hourly records")
        rows, ignored = {}, set()
        for i, rec in enumerate(history):
            if not isinstance(rec, dict) or "hour" not in rec:
                raise ValueError("history[%d] must be an object with an 'hour' field" % i)
            h = rec["hour"]
            if isinstance(h, bool) or not isinstance(h, (int, float)) or not math.isfinite(h) or h != int(h):
                raise ValueError("history[%d].hour must be a whole number" % i)
            h = int(h)
            if h in rows:
                raise ValueError("duplicate hour %d" % h)
            vals = []
            for v in self.vitals:
                x = rec.get(v)
                if x is None:
                    vals.append(np.nan); continue
                if isinstance(x, bool) or not isinstance(x, (int, float)):
                    raise ValueError("history[%d].%s must be a number or null" % (i, v))
                if not math.isfinite(x):
                    raise ValueError("history[%d].%s is not a finite number" % (i, v))
                vals.append(float(x))
            rows[h] = vals
            ignored |= set(rec) - set(self.vitals) - {"hour"}
        hours = sorted(rows); warn = []
        full = np.arange(hours[0], hours[-1] + 1)
        V = np.full((len(full), len(self.vitals)), np.nan, dtype=np.float32)
        for h in hours:
            V[h - full[0]] = rows[h]
        if len(full) - len(hours):
            warn.append("%d hour(s) missing from the hourly series were treated as unmeasured." % (len(full) - len(hours)))
        if len(full) > MAX_ROWS:
            V, full = V[-MAX_ROWS:], full[-MAX_ROWS:]
            warn.append("History longer than %d hours; only the most recent %d hours were used." % (MAX_ROWS, MAX_ROWS))
        return full, V, warn, sorted(ignored), len(hours)

    def _static(self, age, gender):
        if age is None or gender is None:
            raise ValueError("age and gender are required: this model uses both as inputs")
        if isinstance(age, bool) or not isinstance(age, (int, float)) or not math.isfinite(age) or not 0 <= age <= 120:
            raise ValueError("age must be a number between 0 and 120")
        if isinstance(gender, bool) or gender not in (0, 1):
            raise ValueError("gender must be 0 (female) or 1 (male), as in the training data")
        return np.array([(age - self.age_mean) / self.age_std, gender], dtype=np.float32)

    def _features(self, V, static):
        V = V.copy(); bad = []
        for j, v in enumerate(self.vitals):
            lo, hi = self.ranges[v]
            m = (V[:, j] < lo) | (V[:, j] > hi)
            if m.any():
                bad.append("%s x%d" % (v, int(m.sum()))); V[m, j] = np.nan
        obs = ~np.isnan(V)
        filled = V.copy()
        for j in range(V.shape[1]):
            last = np.nan
            for t in range(len(filled)):                    # looks backwards in time only
                if np.isnan(filled[t, j]): filled[t, j] = last
                else: last = filled[t, j]
        lead = np.isnan(filled)
        filled[lead] = np.broadcast_to(self.med, filled.shape)[lead]
        Z = ((filled - self.mean) / self.std).astype(np.float32)
        S = np.broadcast_to(static, (len(Z), 2)).astype(np.float32)
        return obs, Z, obs.astype(np.float32), S, bad

    def _sequence_input(self, Z, OBS, S):
        F = torch.from_numpy(np.concatenate([Z, OBS, S], 1))
        idx = torch.arange(len(F))[:, None] + torch.arange(-self.W + 1, 1)[None, :]
        ok = idx >= 0
        x = F[idx.clamp(min=0)] * ok[..., None]
        return torch.cat([x, ok[..., None].float()], 2)

    def raw_scores(self, Z, OBS, S):
        """Raw score of every model for every hour; each hour uses only itself and earlier hours."""
        T = X = None; out = {}
        for key, net in self.nets.items():
            if self.info[key]["kind"].startswith("tabular"):
                if T is None: T = window_features(Z, OBS, S, self.W)
                out[key] = net.predict_proba(T)[:, 1]
            else:
                if X is None: X = self._sequence_input(Z, OBS, S)
                with torch.no_grad():
                    out[key] = torch.sigmoid(net[1](net[0](X)) if isinstance(net, tuple) else net(X)).numpy()
        return out

    def _cal(self, key, p):
        m = self.info[key]; p = np.clip(np.asarray(p, dtype=np.float64), 1e-6, 1 - 1e-6)
        return 1 / (1 + np.exp(-(m["platt_a"] * np.log(p / (1 - p)) + m["platt_b"])))

    def alert_levels(self, key):
        """The two thresholds on the calibrated-probability scale, for drawing the alert line next to a probability."""
        m = self.info[key]
        return dict(elevated_probability=round(float(self._cal(key, m["elevated_raw_threshold"])), 4),
                    high_probability=round(float(self._cal(key, m["high_raw_threshold"])), 4))

    def _level(self, key, raw):
        m = self.info[key]
        return "HIGH" if raw >= m["high_raw_threshold"] else ("ELEVATED" if raw >= m["elevated_raw_threshold"] else "LOW")

    def _score(self, history, age, gender):
        hours, V, warn, ignored, n_given = self._parse(history)
        obs, Z, OBS, S, bad = self._features(V, self._static(age, gender))
        raw = self.raw_scores(Z, OBS, S)
        if bad: warn.append("Values outside the plausible range were treated as missing: " + ", ".join(bad) + ".")
        if len(hours) < self.W: warn.append("Only %d of %d hours of history so far; the window is padded, so the score is less reliable." % (len(hours), self.W))
        if not obs[-1].any(): warn.append("No vitals recorded at the latest hour; the last known values are carried forward.")
        for j, v in enumerate(self.vitals):
            if not obs[:, j].any(): warn.append("%s was never measured in the supplied history; the training median was used." % v)
        return hours, raw, warn, ignored, obs

    def predict_all(self, history, age, gender):
        """Every model's score for the latest hour."""
        hours, raw, warn, ignored, _ = self._score(history, age, gender)
        res = {}
        for key, r in raw.items():
            r = float(r[-1])
            res[key] = dict(name=self.info[key]["name"], kind=self.info[key]["kind"], model_score=round(r, 4),
                            sepsis_probability=round(float(self._cal(key, r)), 4), risk_level=self._level(key, r))
        return dict(primary=self.primary, as_of_hour=int(hours[-1]), history_hours=int(min(len(hours), self.W)), models=res,
                    warnings=warn, ignored_fields=ignored, disclaimer=DISCLAIMER)

    def predict_series(self, history, age, gender):
        """Every model's score for every hour, in one pass: hour t uses only hours <= t, so this equals
        calling predict_all once per hour with the history up to that hour."""
        hours, raw, warn, ignored, obs = self._score(history, age, gender)
        # Warnings about one hour (the series-wide ones in `warnings` describe the latest hour).
        hour_warnings = []
        for i in range(len(hours)):
            w = []
            if i + 1 < self.W: w.append("Only %d of %d hours of history so far; the score is less reliable." % (i + 1, self.W))
            if not obs[i].any(): w.append("No vitals recorded this hour; the last known values are carried forward.")
            hour_warnings.append(w)
        models = {}
        for key, r in raw.items():
            models[key] = [dict(hour=int(h), model_score=float(s), sepsis_probability=float(self._cal(key, s)), risk_level=self._level(key, float(s)))
                           for h, s in zip(hours, r)]
        return dict(primary=self.primary, hours=[int(h) for h in hours], hour_warnings=hour_warnings, models=models,
                    warnings=warn, ignored_fields=ignored, disclaimer=DISCLAIMER)

    def comparison(self):
        f = HERE / "results" / "model_comparison.csv"
        if not f.exists(): return []
        # pandas wrote the model names as an unlabelled first column.
        return [{("Model" if k == "" else k): v for k, v in row.items()} for row in csv.DictReader(open(f))]

import type { SepsisWatch, Vital } from "@carepulse/api/types";

// The four vital strips, in display order. `step` rounds each strip's y-axis
// outward to a tidy number.
export const VITAL_STRIPS: { key: Vital; label: string; unit: string; step: number; decimals: number }[] = [
  { key: "HR", label: "Heart rate", unit: "bpm", step: 20, decimals: 0 },
  { key: "O2Sat", label: "SpO₂", unit: "%", step: 5, decimals: 0 },
  { key: "Temp", label: "Temperature", unit: "°C", step: 1, decimals: 1 },
  { key: "Resp", label: "Respiratory rate", unit: "/min", step: 5, decimals: 0 },
];

// One row per hour of the stay, shared by every strip so they all sit on the
// same axis. For each vital: the value measured that hour (null if none), the
// last known value carried through gaps, and — set by `withCursor` — the part
// of the carried line up to the cursor.
export type WatchRow = { hour: number } & Record<string, number | null>;

export function buildRows(watch: SepsisWatch, modelKey: string): WatchRow[] {
  const risk = new Map((watch.risk[modelKey] ?? []).map((point) => [point.hour, point]));
  const lastKnown: Partial<Record<Vital, number>> = {};
  return watch.hours.map((hourly) => {
    const row: WatchRow = { hour: hourly.hour, risk: null, alertRisk: null };
    for (const { key } of VITAL_STRIPS) {
      const value = hourly[key];
      if (value !== null) lastKnown[key] = value;
      row[key] = value;
      row[`${key}Carried`] = lastKnown[key] ?? null;
    }
    const point = risk.get(hourly.hour);
    row.risk = point?.probability ?? null;
    row.alertRisk = point?.alert ? point.probability : null;
    return row;
  });
}

// Adds the "up to the cursor" copy of each line, drawn bright over the faded
// full line so everything after the cursor reads as not-yet-happened.
export function withCursor(rows: WatchRow[], cursor: number): WatchRow[] {
  return rows.map((row) => {
    const next: WatchRow = { ...row };
    for (const { key } of VITAL_STRIPS) next[`${key}Past`] = row.hour <= cursor ? row[`${key}Carried`] : null;
    next.riskPast = row.hour <= cursor ? row.risk : null;
    return next;
  });
}

export function yDomainFor(watch: SepsisWatch, vital: Vital, step: number): [number, number] {
  const values = watch.hours.map((hourly) => hourly[vital]).filter((value): value is number => value !== null);
  const { min, max } = watch.normalRanges[vital];
  const low = Math.min(min, ...values);
  const high = Math.max(max, ...values);
  return [Math.floor(low / step) * step, Math.ceil(high / step) * step];
}

export function formatPercent(probability: number): string {
  const percent = probability * 100;
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}

export interface WatchSummary {
  stayHours: number;
  firstAlertHour: number | null;
  alertCount: number;
  // Hours between the first alert and the defined onset (positive = before
  // it). Null unless the stay is a replayed one with a known onset.
  leadHours: number | null;
}

export function summarize(watch: SepsisWatch, modelKey: string): WatchSummary {
  const alerts = (watch.risk[modelKey] ?? []).filter((point) => point.alert).map((point) => point.hour);
  const firstAlertHour = alerts.length > 0 ? Math.min(...alerts) : null;
  const onset = watch.simulation?.onsetHour ?? null;
  return {
    stayHours: watch.hours.length,
    firstAlertHour,
    alertCount: alerts.length,
    leadHours: firstAlertHour !== null && onset !== null ? onset - firstAlertHour : null,
  };
}

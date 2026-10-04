import { useState } from "react";
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LabelProps, TooltipContentProps } from "recharts";
import type { RiskLevel, VitalsHistory } from "@carepulse/api/types";

// Lazy-loaded by VitalsHistory, so recharts only downloads on the vitals pages.
//
// Colours: every chart colour is a CSS variable set on the wrapper, with a
// light and a dark value, so the SVG follows the theme toggle like the rest of
// the UI. Single-metric lines use the CarePulse primary. The blood-pressure
// chart needs three distinguishable series, which the cp-* tokens don't
// provide (the primary teal reads as gray beside other hues), so it uses the
// first three slots of the dataviz reference palette — validated as a set
// against cp-card light and dark (CVD and normal-vision separation pass).
// The risk bands are status colours used for status: they're always labelled
// LOW / ELEVATED / HIGH on the axis, never colour alone.
const CHART_VARS = [
  "[--chart-line:var(--color-cp-primary)] dark:[--chart-line:var(--color-cp-primary-dark)]",
  "[--chart-grid:var(--color-cp-border)] dark:[--chart-grid:var(--color-cp-border-dark)]",
  "[--chart-axis:var(--color-cp-text-muted)] dark:[--chart-axis:var(--color-cp-text-muted-dark)]",
  "[--chart-surface:var(--color-cp-card)] dark:[--chart-surface:var(--color-cp-card-dark)]",
  "[--series-sbp:#2a78d6] dark:[--series-sbp:#3987e5]",
  "[--series-map:#eb6834] dark:[--series-map:#d95926]",
  "[--series-dbp:#1baf7a] dark:[--series-dbp:#199e70]",
  "[--band-low:var(--color-cp-success-bg)] dark:[--band-low:var(--color-cp-success-bg-dark)]",
  "[--band-elevated:var(--color-cp-pending-bg)] dark:[--band-elevated:var(--color-cp-pending-bg-dark)]",
  // Error has no light cp token (see DESIGN.md) — the same red-50 the Alert primitive uses.
  "[--band-high:#fef2f2] dark:[--band-high:var(--color-cp-error-bg-dark)]",
].join(" ");

const RISK_LEVELS: RiskLevel[] = ["LOW", "ELEVATED", "HIGH"];

type SeriesKey = "HR" | "O2Sat" | "Temp" | "Resp" | "SBP" | "MAP" | "DBP";
type TabKey = "risk" | "HR" | "O2Sat" | "Temp" | "Resp" | "BP";

const TABS: { key: TabKey; label: string }[] = [
  { key: "risk", label: "ML risk" },
  { key: "HR", label: "Heart rate" },
  { key: "O2Sat", label: "SpO₂" },
  { key: "Temp", label: "Temperature" },
  { key: "Resp", label: "Respiratory rate" },
  { key: "BP", label: "Blood pressure" },
];

const SERIES: Record<SeriesKey, { label: string; unit: string; color: string }> = {
  HR: { label: "Heart rate", unit: "bpm", color: "var(--chart-line)" },
  O2Sat: { label: "SpO₂", unit: "%", color: "var(--chart-line)" },
  Temp: { label: "Temperature", unit: "°C", color: "var(--chart-line)" },
  Resp: { label: "Respiratory rate", unit: "/min", color: "var(--chart-line)" },
  SBP: { label: "Systolic", unit: "mmHg", color: "var(--series-sbp)" },
  MAP: { label: "Mean arterial", unit: "mmHg", color: "var(--series-map)" },
  DBP: { label: "Diastolic", unit: "mmHg", color: "var(--series-dbp)" },
};

const TAB_SERIES: Record<Exclude<TabKey, "risk">, SeriesKey[]> = {
  HR: ["HR"],
  O2Sat: ["O2Sat"],
  Temp: ["Temp"],
  Resp: ["Resp"],
  BP: ["SBP", "MAP", "DBP"],
};

interface Row extends Record<SeriesKey, number | null> {
  time: number;
  // 0 / 1 / 2 for LOW / ELEVATED / HIGH; null when the model couldn't score.
  riskTier: number | null;
  riskLevel: RiskLevel | null;
  probability: number | null;
}

function formatTime(time: number): string {
  return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toRows(history: VitalsHistory): Row[] {
  const predictionByReading = new Map(history.predictions.map((prediction) => [prediction.readingId, prediction]));
  return history.readings.map((reading) => {
    const prediction = predictionByReading.get(reading.id);
    const scored = prediction?.status === "scored" && prediction.riskLevel ? prediction : null;
    return {
      time: new Date(reading.recordedAt).getTime(),
      HR: reading.HR,
      O2Sat: reading.O2Sat,
      Temp: reading.Temp,
      Resp: reading.Resp,
      SBP: reading.SBP,
      MAP: reading.MAP,
      DBP: reading.DBP,
      riskTier: scored ? RISK_LEVELS.indexOf(scored.riskLevel!) : null,
      riskLevel: scored?.riskLevel ?? null,
      probability: scored?.sepsisProbability ?? null,
    };
  });
}

// Values lead, the series name follows; each row is keyed with a short
// stroke of its series colour rather than a filled box.
function TooltipFrame({ time, children }: { time: number; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-cp-border bg-cp-card px-3 py-2 shadow-lg dark:border-cp-border-dark dark:bg-cp-card-dark">
      <p className="mb-1 font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">{formatTime(time)}</p>
      {children}
    </div>
  );
}

function VitalsTooltip({ active, payload, keys }: TooltipContentProps & { keys: SeriesKey[] }) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <TooltipFrame time={row.time}>
      {keys.map((key) => (
        <p key={key} className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: SERIES[key].color }} />
          <span className="font-semibold text-cp-text dark:text-cp-text-dark">
            {row[key] ?? "—"} {row[key] !== null && SERIES[key].unit}
          </span>
          <span className="text-cp-text-muted dark:text-cp-text-muted-dark">{SERIES[key].label}</span>
        </p>
      ))}
    </TooltipFrame>
  );
}

function RiskTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <TooltipFrame time={row.time}>
      <p className="text-sm font-semibold text-cp-text dark:text-cp-text-dark">
        {row.riskLevel
          ? `${row.riskLevel} · ${((row.probability ?? 0) * 100).toFixed(1)}%`
          : "Risk unknown — not scored"}
      </p>
    </TooltipFrame>
  );
}

const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 12 };

// Round y-axis ticks (37, 38, 39 rather than 36.9, 37.8, 38.7): a 1/2/5 × 10ⁿ
// step (plus 25/250… for wide ranges like blood pressure) giving about five
// ticks around the plotted values. Flat data is padded so the axis has height.
function niceTicks(values: number[]): number[] | undefined {
  if (values.length === 0) return undefined;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rough = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiples = magnitude >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = multiples.map((m) => m * magnitude).find((candidate) => candidate >= rough)!;
  const ticks: number[] = [];
  for (let tick = Math.floor(min / step) * step; tick < max + step; tick += step) {
    ticks.push(Number(tick.toFixed(4)));
    if (tick >= max) break;
  }
  return ticks;
}

function TimeAxis() {
  return (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={["dataMin", "dataMax"]}
      tickFormatter={formatTime}
      tick={AXIS_TICK}
      stroke="var(--chart-grid)"
      tickLine={false}
      minTickGap={48}
    />
  );
}

function RiskChart({ rows }: { rows: Row[] }) {
  return (
    <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
      <ReferenceArea y1={-0.5} y2={0.5} fill="var(--band-low)" fillOpacity={1} ifOverflow="hidden" />
      <ReferenceArea y1={0.5} y2={1.5} fill="var(--band-elevated)" fillOpacity={1} ifOverflow="hidden" />
      <ReferenceArea y1={1.5} y2={2.5} fill="var(--band-high)" fillOpacity={1} ifOverflow="hidden" />
      <TimeAxis />
      <YAxis
        type="number"
        domain={[-0.5, 2.5]}
        ticks={[0, 1, 2]}
        tickFormatter={(tier: number) => RISK_LEVELS[tier]}
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        width={80}
      />
      <Tooltip content={(props) => <RiskTooltip {...props} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
      {/* Unscored readings stay gaps: carrying a tier through them would claim a risk nobody measured. */}
      <Line
        dataKey="riskTier"
        type="stepAfter"
        stroke="var(--chart-line)"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 5, fill: "var(--chart-line)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
        connectNulls={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

function VitalsChart({ rows, keys }: { rows: Row[]; keys: SeriesKey[] }) {
  // Direct labels supplement the legend, but only for lines that run to the
  // right edge: a series that stopped being measured mid-stay would put its
  // label in among the other lines, where it reads as noise.
  const lastIndex = Object.fromEntries(
    keys.map((key) => [key, rows.reduce((last, row, index) => (row[key] !== null ? index : last), -1)])
  );
  const labelledAt = (key: SeriesKey) => (lastIndex[key] >= rows.length - 2 ? lastIndex[key] : -1);
  const ticks = niceTicks(
    rows.flatMap((row) => keys.map((key) => row[key]).filter((value): value is number => value !== null))
  );
  return (
    <LineChart data={rows} margin={{ top: 8, right: keys.length > 1 ? 72 : 16, bottom: 0, left: 8 }}>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
      <TimeAxis />
      <YAxis
        domain={ticks ? [ticks[0], ticks[ticks.length - 1]] : ["auto", "auto"]}
        ticks={ticks}
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        width={48}
      />
      <Tooltip
        content={(props) => <VitalsTooltip {...props} keys={keys} />}
        cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
      />
      {keys.map((key) => (
        // Measurements are often hours apart (temperature especially), so the
        // line joins consecutive measurements and every real one gets a dot —
        // an isolated reading would otherwise vanish between two gaps.
        <Line
          key={key}
          dataKey={key}
          name={SERIES[key].label}
          stroke={SERIES[key].color}
          strokeWidth={2}
          dot={{ r: 3, fill: SERIES[key].color, stroke: "var(--chart-surface)", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: SERIES[key].color, stroke: "var(--chart-surface)", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
          label={
            keys.length > 1
              ? ({ x, y, index }: LabelProps) =>
                  index === labelledAt(key) ? (
                    <text key={key} x={Number(x) + 10} y={Number(y) + 4} fontSize={12} fill="var(--chart-axis)">
                      {key}
                    </text>
                  ) : null
              : undefined
          }
        />
      ))}
    </LineChart>
  );
}

// "Trends / ML Analysis": one chart at a time, chosen by tabs, drawn from the
// same readings and scores the table below lists (which doubles as the
// table view for every value here).
export default function VitalsTrends({ history }: { history: VitalsHistory }) {
  const [tab, setTab] = useState<TabKey>("risk");
  const rows = toRows(history);
  const current = TABS.find((candidate) => candidate.key === tab)!;
  const seriesKeys = tab === "risk" ? [] : TAB_SERIES[tab];

  return (
    <div className={CHART_VARS}>
      <div role="tablist" aria-label="Trend to show" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            role="tab"
            aria-selected={candidate.key === tab}
            onClick={() => setTab(candidate.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              candidate.key === tab
                ? "bg-cp-nav-selected text-cp-primary dark:bg-cp-nav-selected-dark dark:text-cp-primary-dark"
                : "text-cp-text-muted hover:bg-cp-workspace dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {tab === "risk" ? (
        <p className="mb-2 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          Sepsis risk tier at each reading, LOW → ELEVATED → HIGH. Gaps are readings the model couldn&apos;t score.
        </p>
      ) : seriesKeys.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-4 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          {seriesKeys.map((key) => (
            <span key={key} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: SERIES[key].color }} />
              {SERIES[key].label} ({key}, {SERIES[key].unit})
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          {SERIES[seriesKeys[0]].label} ({SERIES[seriesKeys[0]].unit}) at each reading.
        </p>
      )}

      <div role="img" aria-label={`${current.label} over time, ${rows.length} readings`} className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {tab === "risk" ? <RiskChart rows={rows} /> : <VitalsChart rows={rows} keys={seriesKeys} />}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

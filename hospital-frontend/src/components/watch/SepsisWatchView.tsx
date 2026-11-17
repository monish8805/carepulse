import { useEffect, useMemo, useState } from "react";
import type { PointerEvent, ReactElement } from "react";
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Info, Pause, Play } from "lucide-react";
import type { SepsisWatch } from "@carepulse/api/types";
import { Badge, Button, Card, EmptyState } from "@carepulse/ui";
import {
  buildRows,
  formatPercent,
  summarize,
  VITAL_STRIPS,
  withCursor,
  yDomainFor,
  type WatchRow,
} from "./watchData";

const FOOTER_TEXT =
  "Research prototype trained on retrospective PhysioNet/CinC 2019 data. Not a diagnostic tool and not clinically validated; do not use for patient care decisions.";

const RISK_NOTE =
  "Risk numbers are small on purpose: only about 1.8% of hours in the training data were positive, so a high-risk hour can read 5–10%.";

// Same token approach as VitalsTrends: SVG reads these CSS variables, which
// switch with the theme. The alert colour has no light cp token (see DESIGN.md);
// it is the same red the Badge/Alert primitives use.
const WATCH_VARS = [
  "[--chart-line:var(--color-cp-primary)] dark:[--chart-line:var(--color-cp-primary-dark)]",
  "[--chart-grid:var(--color-cp-border)] dark:[--chart-grid:var(--color-cp-border-dark)]",
  "[--chart-axis:var(--color-cp-text-muted)] dark:[--chart-axis:var(--color-cp-text-muted-dark)]",
  "[--chart-surface:var(--color-cp-card)] dark:[--chart-surface:var(--color-cp-card-dark)]",
  "[--watch-band:var(--color-cp-success-bg)] dark:[--watch-band:var(--color-cp-success-bg-dark)]",
  "[--watch-marker:var(--color-cp-pending-text)] dark:[--watch-marker:var(--color-cp-pending-text-dark)]",
  "[--watch-alert:#ef4444] dark:[--watch-alert:var(--color-cp-error-text-dark)]",
].join(" ");

// Every strip reserves the same left axis and right margin, so the plot areas
// line up and one pointer position means the same hour in all of them.
const PLOT_LEFT = 52;
const PLOT_RIGHT = 12;
const MARGIN = { top: 6, right: PLOT_RIGHT, bottom: 4, left: 0 };
const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 11 };
const PLAY_INTERVAL_MS = 350;

function formatHourTime(startsAt: string | null, hour: number): string | null {
  if (!startsAt) return null;
  return new Date(new Date(startsAt).getTime() + hour * 3600_000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={text}
        title={text}
        className="rounded-full text-cp-text-subtle hover:text-cp-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cp-primary dark:text-cp-text-subtle-dark dark:hover:text-cp-text-dark dark:focus-visible:outline-cp-primary-dark"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-6 left-0 z-20 hidden w-64 rounded-lg border border-cp-border bg-cp-card px-3 py-2 text-xs font-normal text-cp-text shadow-lg group-focus-within:block group-hover:block dark:border-cp-border-dark dark:bg-cp-card-dark dark:text-cp-text-dark"
      >
        {text}
      </span>
    </span>
  );
}

// Hover (mouse) or drag (touch/pen/mouse) sets the shared cursor. Lives on an
// overlay over each plot, so the chart library itself stays passive.
function useCursorHandlers(lastHour: number, setCursor: (hour: number) => void, onTouch: () => void) {
  function hourAt(event: PointerEvent<HTMLElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left - PLOT_LEFT) / (rect.width - PLOT_LEFT - PLOT_RIGHT);
    return Math.min(lastHour, Math.max(0, Math.round(fraction * lastHour)));
  }
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      onTouch();
      setCursor(hourAt(event));
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === "mouse" || event.currentTarget.hasPointerCapture(event.pointerId)) {
        onTouch();
        setCursor(hourAt(event));
      }
    },
  };
}

type Handlers = ReturnType<typeof useCursorHandlers>;

// A dot on an hour that has a real reading (or an alert); faded once the
// cursor is before it.
function dotAt(cursor: number, color: string, radius: number, ring = false) {
  return function Dot(props: { cx?: number; cy?: number; index?: number; payload?: WatchRow }) {
    const { cx, cy, index, payload } = props;
    if (cx == null || cy == null || !payload) return <g key={index} />;
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={radius}
        fill={color}
        stroke={ring ? "var(--chart-surface)" : "none"}
        strokeWidth={ring ? 1.5 : 0}
        opacity={payload.hour <= cursor ? 1 : 0.3}
      />
    );
  };
}

// Where the dataset's label turns on and the defined onset — only ever for a
// replayed retrospective stay.
function stayMarkers(simulation: SepsisWatch["simulation"], withLabels: boolean): ReactElement[] {
  const lines: ReactElement[] = [];
  // Both labels sit to the left of their line, so the two lines 6 hours apart don't collide.
  const label = (value: string) =>
    withLabels ? { value, position: "insideTopRight" as const, fontSize: 11, fill: "var(--watch-marker)" } : undefined;
  if (simulation?.labelStartsHour != null) {
    lines.push(
      <ReferenceLine
        key="label"
        x={simulation.labelStartsHour}
        stroke="var(--watch-marker)"
        strokeDasharray="4 3"
        label={label("label starts")}
      />
    );
  }
  if (simulation?.onsetHour != null) {
    lines.push(
      <ReferenceLine
        key="onset"
        x={simulation.onsetHour}
        stroke="var(--watch-marker)"
        strokeWidth={2}
        label={label("onset")}
      />
    );
  }
  return lines;
}

function StripHeader({ title, tip, children }: { title: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="text-sm font-semibold text-cp-text dark:text-cp-text-dark">
        {title} {tip && <InfoTip text={tip} />}
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-sm text-cp-text dark:text-cp-text-dark">{children}</div>
    </div>
  );
}

function ChartBox({ height, handlers, label, children }: { height: number; handlers: Handlers; label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as ReactElement}
      </ResponsiveContainer>
      <div className="absolute inset-0 cursor-ew-resize touch-pan-y" {...handlers} />
    </div>
  );
}

function VitalStrip({
  watch,
  strip,
  data,
  cursor,
  lastHour,
  handlers,
}: {
  watch: SepsisWatch;
  strip: (typeof VITAL_STRIPS)[number];
  data: WatchRow[];
  cursor: number;
  lastHour: number;
  handlers: Handlers;
}) {
  const { key, label, unit, step, decimals } = strip;
  const normal = watch.normalRanges[key];
  const row = data[cursor];
  const measured = row[key];
  const carried = row[`${key}Carried`];
  return (
    <div>
      <StripHeader title={`${label} (${unit})`}>
        {carried === null ? (
          <span className="text-cp-text-muted dark:text-cp-text-muted-dark">no reading yet</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">
              {carried.toFixed(decimals)} {unit}
            </span>
            {measured === null && <Badge>carried forward</Badge>}
          </>
        )}
      </StripHeader>
      <ChartBox
        height={92}
        handlers={handlers}
        label={`${label}, hourly, normal range ${normal.min}–${normal.max} ${unit}`}
      >
        <LineChart data={data} margin={MARGIN}>
          <XAxis dataKey="hour" type="number" domain={[0, lastHour]} hide />
          <YAxis
            width={PLOT_LEFT}
            domain={yDomainFor(watch, key, step)}
            tickCount={3}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceArea y1={normal.min} y2={normal.max} fill="var(--watch-band)" fillOpacity={1} ifOverflow="hidden" />
          {stayMarkers(watch.simulation, false)}
          <Line dataKey={`${key}Carried`} type="stepAfter" stroke="var(--chart-line)" strokeOpacity={0.3} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          <Line dataKey={`${key}Past`} type="stepAfter" stroke="var(--chart-line)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          <Line dataKey={key} stroke="none" dot={dotAt(cursor, "var(--chart-line)", 2.5)} activeDot={false} isAnimationActive={false} />
          <ReferenceLine x={cursor} stroke="var(--chart-axis)" strokeWidth={1.5} />
        </LineChart>
      </ChartBox>
    </div>
  );
}

function RiskStrip({
  watch,
  modelKey,
  data,
  cursor,
  lastHour,
  handlers,
}: {
  watch: SepsisWatch;
  modelKey: string;
  data: WatchRow[];
  cursor: number;
  lastHour: number;
  handlers: Handlers;
}) {
  const level = watch.alertLevels?.[modelKey]?.high ?? null;
  const points = watch.risk[modelKey] ?? [];
  const here = points.find((point) => point.hour === cursor);
  const top = Math.max(level ?? 0, ...points.map((point) => point.probability), 0.02) * 1.2;
  const warnings = watch.warnings.find((entry) => entry.hour === cursor)?.warnings ?? [];

  return (
    <div>
      <StripHeader title="Sepsis risk (calibrated probability)" tip={RISK_NOTE}>
        {here ? (
          <>
            <span className="font-semibold tabular-nums">{formatPercent(here.probability)}</span>
            <Badge tone={here.alert ? "danger" : "success"}>{here.alert ? "Alert" : "Below alert level"}</Badge>
          </>
        ) : (
          <Badge>Not scored</Badge>
        )}
      </StripHeader>
      <ChartBox height={170} handlers={handlers} label={`Sepsis risk over the stay for the selected model, ${points.length} scored hours`}>
        <LineChart data={data} margin={{ ...MARGIN, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, lastHour]}
            allowDecimals={false}
            tick={AXIS_TICK}
            stroke="var(--chart-grid)"
            tickLine={false}
            minTickGap={24}
            height={24}
          />
          <YAxis
            width={PLOT_LEFT}
            domain={[0, top]}
            tickCount={3}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => (value === 0 ? "0%" : formatPercent(value))}
          />
          {stayMarkers(watch.simulation, true)}
          {level !== null && (
            <ReferenceLine
              y={level}
              stroke="var(--watch-alert)"
              strokeDasharray="5 4"
              label={{ value: `Alert level ${formatPercent(level)}`, position: "center", dy: -9, fontSize: 11, fill: "var(--watch-alert)" }}
            />
          )}
          <Line dataKey="risk" type="linear" stroke="var(--chart-line)" strokeOpacity={0.3} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          <Line dataKey="riskPast" type="linear" stroke="var(--chart-line)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          <Line dataKey="alertRisk" stroke="none" dot={dotAt(cursor, "var(--watch-alert)", 4, true)} activeDot={false} isAnimationActive={false} />
          <ReferenceLine x={cursor} stroke="var(--chart-axis)" strokeWidth={1.5} />
        </LineChart>
      </ChartBox>
      <p className="mt-1 text-center text-xs text-cp-text-muted dark:text-cp-text-muted-dark">Hour of stay</p>
      {level === null && points.length > 0 && (
        <p className="mt-1 text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
          The alert level couldn&apos;t be loaded from the model service, so it isn&apos;t drawn.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-cp-pending-text dark:text-cp-pending-text-dark">
          {warnings.map((warning) => (
            <li key={warning}>Hour {cursor}: {warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-cp-border bg-cp-workspace p-3 dark:border-cp-border-dark dark:bg-cp-workspace-dark">
      <dt className="font-mono text-[11px] font-semibold tracking-wide text-cp-text-muted uppercase dark:text-cp-text-muted-dark">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-cp-text dark:text-cp-text-dark">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-cp-text-muted dark:text-cp-text-muted-dark">{hint}</p>}
    </div>
  );
}

function leadTimeText(leadHours: number | null, simulation: SepsisWatch["simulation"], firstAlertHour: number | null) {
  if (!simulation) return { value: "—", hint: "Needs a known onset; a live patient has none" };
  if (simulation.onsetHour === null) return { value: "—", hint: "No onset in this stay" };
  if (firstAlertHour === null || leadHours === null) return { value: "—", hint: "No alert before or after the onset" };
  if (leadHours >= 0) return { value: `${leadHours} h`, hint: "first alert before the defined onset" };
  return { value: `${-leadHours} h late`, hint: "first alert after the defined onset" };
}

function number3(value: string | undefined): string {
  return value === undefined || value === "" ? "—" : Number(value).toFixed(3);
}

function AboutModel({ watch, modelKey }: { watch: SepsisWatch; modelKey: string }) {
  const name = watch.models.find((model) => model.key === modelKey)?.name;
  const selected = watch.comparison?.find((row) => row.Model === name);
  return (
    <Card title="About this model" description="Held-out test results from the model service." collapsible defaultOpen={false}>
      {watch.comparison === null ? (
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          The model service couldn&apos;t be reached, so its test results aren&apos;t available right now.
        </p>
      ) : (
        <div className="space-y-3">
          {selected && (
            <p className="text-sm text-cp-text dark:text-cp-text-dark">
              {name}: AUROC {number3(selected.AUROC)} (95% CI {selected["AUROC 95% CI"]}). At the alert level, precision is{" "}
              {formatPercent(Number(selected.Precision))} and recall {formatPercent(Number(selected.Recall))}. In other words, most alerts
              are false alarms — sepsis hours are rare (about 1.8% of hours), and four vitals plus age and gender are only a weak signal.
            </p>
          )}
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-cp-border text-xs text-cp-text-muted dark:border-cp-border-dark dark:text-cp-text-muted-dark">
                  {["Model", "AUROC", "Precision", "Recall", "F1"].map((heading) => (
                    <th key={heading} className="py-2 pr-3 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cp-border dark:divide-cp-border-dark">
                {watch.comparison.map((row) => (
                  <tr key={row.Model} className={`text-cp-text dark:text-cp-text-dark ${row.Model === name ? "font-semibold" : ""}`}>
                    <td className="py-2 pr-3">{row.Model}</td>
                    <td className="py-2 pr-3 tabular-nums">{number3(row.AUROC)}</td>
                    <td className="py-2 pr-3 tabular-nums">{number3(row.Precision)}</td>
                    <td className="py-2 pr-3 tabular-nums">{number3(row.Recall)}</td>
                    <td className="py-2 tabular-nums">{number3(row.F1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
            Trained and tested on retrospective ICU data (PhysioNet/CinC 2019), split by patient. Not validated on live patients.
          </p>
        </div>
      )}
    </Card>
  );
}

function WatchBody({ watch }: { watch: SepsisWatch }) {
  const scoredModels = watch.models.filter((model) => (watch.risk[model.key]?.length ?? 0) > 0);
  const [modelKey, setModelKey] = useState(
    () => scoredModels.find((model) => model.key === watch.primary)?.key ?? scoredModels[0]?.key ?? ""
  );
  const lastHour = Math.max(0, watch.hours.length - 1);
  const [cursor, setCursor] = useState(lastHour);
  const [playRequested, setPlaying] = useState(false);
  // Replay stops by itself at the end of the stay.
  const playing = playRequested && cursor < lastHour;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setCursor((hour) => Math.min(lastHour, hour + 1)), PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, lastHour]);

  const handlers = useCursorHandlers(lastHour, setCursor, () => setPlaying(false));
  const rows = useMemo(() => buildRows(watch, modelKey), [watch, modelKey]);
  const data = useMemo(() => withCursor(rows, cursor), [rows, cursor]);
  const summary = summarize(watch, modelKey);
  const lead = leadTimeText(summary.leadHours, watch.simulation, summary.firstAlertHour);
  const timeLabel = formatHourTime(watch.startsAt, cursor);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (cursor >= lastHour) setCursor(0);
    setPlaying(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={togglePlay} aria-label={playing ? "Pause replay" : "Play replay"}>
            {playing ? <Pause className="mr-1.5 inline h-4 w-4" aria-hidden="true" /> : <Play className="mr-1.5 inline h-4 w-4" aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <input
            type="range"
            min={0}
            max={lastHour}
            value={cursor}
            onChange={(event) => {
              setPlaying(false);
              setCursor(Number(event.target.value));
            }}
            aria-label="Hour of stay"
            aria-valuetext={`Hour ${cursor}`}
            className="min-w-0 flex-1 accent-cp-primary dark:accent-cp-primary-dark"
          />
          <p className="font-mono text-xs text-cp-text-muted dark:text-cp-text-muted-dark" aria-live="off">
            Hour {cursor} of {lastHour}
            {timeLabel && ` · ${timeLabel}`}
          </p>
        </div>

        <div role="radiogroup" aria-label="Risk model" className="mt-4 flex flex-wrap gap-2">
          {scoredModels.map((model) => (
            <button
              key={model.key}
              type="button"
              role="radio"
              aria-checked={model.key === modelKey}
              onClick={() => setModelKey(model.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cp-primary ${
                model.key === modelKey
                  ? "border-cp-primary bg-cp-nav-selected text-cp-primary dark:border-cp-primary-dark dark:bg-cp-nav-selected-dark dark:text-cp-primary-dark"
                  : "border-cp-border text-cp-text-muted hover:bg-cp-workspace dark:border-cp-border-dark dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
              }`}
            >
              {model.name}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Stay length" value={`${summary.stayHours} h`} />
          <SummaryTile
            label="First alert"
            value={summary.firstAlertHour === null ? "None" : `Hour ${summary.firstAlertHour}`}
          />
          <SummaryTile label="Lead time" value={lead.value} hint={lead.hint} />
          <SummaryTile label="Alert hours" value={String(summary.alertCount)} />
        </dl>

        <div className={`mt-5 space-y-3 ${WATCH_VARS}`}>
          {VITAL_STRIPS.map((strip) => (
            <VitalStrip key={strip.key} watch={watch} strip={strip} data={data} cursor={cursor} lastHour={lastHour} handlers={handlers} />
          ))}
          {scoredModels.length > 0 ? (
            <RiskStrip watch={watch} modelKey={modelKey} data={data} cursor={cursor} lastHour={lastHour} handlers={handlers} />
          ) : (
            <p className="rounded-lg bg-cp-workspace p-3 text-sm text-cp-text-muted dark:bg-cp-workspace-dark dark:text-cp-text-muted-dark">
              No risk scores for this stay yet. They appear once the model service has scored it, which needs the patient&apos;s age and
              male/female gender.
            </p>
          )}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
          <li>Line = last known value; dots = hours with a real reading.</li>
          <li>Green band = usual adult range.</li>
          {watch.simulation && (
            <li>
              Simulated retrospective stay{" "}
              {watch.simulation.labelStartsHour !== null
                ? `· label starts at hour ${watch.simulation.labelStartsHour}, defined onset at hour ${watch.simulation.onsetHour}`
                : "· no onset in this stay"}
            </li>
          )}
        </ul>
      </Card>

      <AboutModel watch={watch} modelKey={modelKey} />

      <p className="text-xs text-cp-text-muted dark:text-cp-text-muted-dark">{FOOTER_TEXT}</p>
    </div>
  );
}

export default function SepsisWatchView({ watch }: { watch: SepsisWatch }) {
  if (watch.hours.length === 0) {
    return <EmptyState title="No readings yet" description="This patient hasn't recorded any vitals, so there is nothing to show." />;
  }
  return <WatchBody key={watch.patient.id} watch={watch} />;
}

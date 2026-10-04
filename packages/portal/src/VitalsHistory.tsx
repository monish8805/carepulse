import { lazy, Suspense } from "react";
import { Activity, BrainCircuit, HeartPulse } from "lucide-react";
import { VITALS } from "@carepulse/api/types";
import type { SepsisPrediction, Vital, VitalsHistory as VitalsHistoryData } from "@carepulse/api/types";
import { Card, EmptyState, RiskBadge, Skeleton } from "@carepulse/ui";

// recharts is only needed here, so it loads with this card, not the app.
const VitalsTrends = lazy(() => import("./VitalsTrends"));

// Display names for the model keys ml-service returns (artifacts/model_registry.json).
const MODEL_NAMES: Record<string, string> = {
  ssl_lstm: "Sepsis Early-Warning (SSL-LSTM)",
  xgboost: "Sepsis Early-Warning (XGBoost)",
  lstm: "Sepsis Early-Warning (LSTM)",
  gru: "Sepsis Early-Warning (GRU)",
  logistic_regression: "Sepsis Early-Warning (logistic regression)",
};

// What the model was trained to flag: PhysioNet 2019's SepsisLabel turns on
// 6 hours before the defined sepsis onset (sepsis_ml_master notebook, §4), so
// a positive score means "sepsis onset likely within about 6 hours, or already
// under way" — not a fixed-length forecast.
const PREDICTION_HORIZON = "Up to 6 h before sepsis onset";

const VITAL_LABELS: Record<Vital, string> = {
  HR: "HR (bpm)",
  O2Sat: "SpO₂ (%)",
  Temp: "Temp (°C)",
  SBP: "SBP",
  MAP: "MAP",
  DBP: "DBP",
  Resp: "Resp (/min)",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm text-cp-text dark:text-cp-text-dark">{children}</dd>
    </div>
  );
}

function PredictionSummary({ prediction, recordedAt }: { prediction: SepsisPrediction; recordedAt: string | null }) {
  const scored = prediction.status === "scored" && prediction.sepsisProbability !== null;
  return (
    <div className="space-y-4">
      <dl className="space-y-3">
        <SummaryRow label="Current risk">
          <RiskBadge status={prediction.status} riskLevel={prediction.riskLevel} />
        </SummaryRow>
        {/* Timed by the reading the score is as of, not when it was written —
            a batch of readings (e.g. a replay) is scored within seconds. */}
        <SummaryRow label="Latest prediction">
          {scored ? (
            <span>{(prediction.sepsisProbability! * 100).toFixed(1)}% estimated probability</span>
          ) : (
            <span>The risk model couldn&apos;t score the latest reading — treat risk as unknown, not low.</span>
          )}
          <span className="font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
            {recordedAt ? `as of the reading of ${formatDateTime(recordedAt)}` : "as of the latest reading"}
          </span>
        </SummaryRow>
        <SummaryRow label="Prediction horizon">{PREDICTION_HORIZON}</SummaryRow>
        <SummaryRow label="Model">
          {prediction.modelKey ? (MODEL_NAMES[prediction.modelKey] ?? prediction.modelKey) : "Not available"}
          {prediction.modelVersion && ` v${prediction.modelVersion}`}
        </SummaryRow>
      </dl>
      {prediction.warning && (
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{prediction.warning}</p>
      )}
      <p className="rounded-lg border border-cp-border bg-cp-quiet-bg px-3 py-2 text-sm font-medium text-cp-text dark:border-cp-border-dark dark:bg-cp-quiet-bg-dark dark:text-cp-text-dark">
        This is a machine-learning prediction, not a medical diagnosis.
      </p>
    </div>
  );
}

// One patient's readings with the sepsis score each one produced — the same
// view on the patient's own /vitals page and on a doctor's patient page.
// The level leads, not the percentage: calibrated probabilities are small
// (HIGH starts around 5–6%), so the number alone reads as reassuring.
export default function VitalsHistory({ history }: { history: VitalsHistoryData }) {
  if (history.readings.length === 0) {
    return (
      <Card>
        <EmptyState title="No vitals recorded yet" />
      </Card>
    );
  }

  const predictionByReading = new Map(history.predictions.map((prediction) => [prediction.readingId, prediction]));
  const latestPrediction = history.predictions[history.predictions.length - 1];
  const latestRecordedAt =
    history.readings.find((reading) => reading.id === latestPrediction?.readingId)?.recordedAt ?? null;
  const newestFirst = [...history.readings].reverse();

  return (
    <div className="space-y-6">
      <Card title="ML prediction summary" icon={BrainCircuit}>
        {latestPrediction ? (
          <PredictionSummary prediction={latestPrediction} recordedAt={latestRecordedAt} />
        ) : (
          <EmptyState title="Not scored yet" />
        )}
      </Card>

      <Card title="Trends / ML Analysis" description="Pick a measurement to chart over time." icon={Activity} collapsible>
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <VitalsTrends history={history} />
        </Suspense>
      </Card>

      <Card
        title="Readings"
        description={`${history.readings.length} reading(s), newest first.`}
        icon={HeartPulse}
        collapsible
      >
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-cp-border text-xs text-cp-text-muted dark:border-cp-border-dark dark:text-cp-text-muted-dark">
                <th className="py-2 pr-3 font-medium">Time</th>
                {VITALS.map((vital) => (
                  <th key={vital} className="py-2 pr-3 font-medium whitespace-nowrap">
                    {VITAL_LABELS[vital]}
                  </th>
                ))}
                <th className="py-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {newestFirst.map((reading) => {
                const prediction = predictionByReading.get(reading.id);
                return (
                  <tr key={reading.id} className="text-cp-text dark:text-cp-text-dark">
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap text-cp-text-subtle dark:text-cp-text-subtle-dark">
                      {formatDateTime(reading.recordedAt)}
                    </td>
                    {VITALS.map((vital) => (
                      <td key={vital} className="py-2 pr-3 tabular-nums">
                        {reading[vital] ?? <span className="text-cp-text-subtle dark:text-cp-text-subtle-dark">—</span>}
                      </td>
                    ))}
                    <td className="py-2">
                      {prediction ? (
                        <RiskBadge status={prediction.status} riskLevel={prediction.riskLevel} />
                      ) : (
                        <span className="text-cp-text-subtle dark:text-cp-text-subtle-dark">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

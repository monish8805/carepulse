import Badge from "./Badge";

interface RiskBadgeProps {
  // A sepsis score's backend status ("scored" | "unavailable") and level.
  status: string;
  riskLevel: string | null;
}

const LEVEL_TONES = { LOW: "success", ELEVATED: "warning", HIGH: "danger" } as const;

// A score the model couldn't produce shows as UNKNOWN, in the neutral tone —
// never folded into LOW: no score is not evidence of low risk.
export default function RiskBadge({ status, riskLevel }: RiskBadgeProps) {
  if (status !== "scored" || !riskLevel || !(riskLevel in LEVEL_TONES)) {
    return <Badge tone="neutral">UNKNOWN</Badge>;
  }
  return <Badge tone={LEVEL_TONES[riskLevel as keyof typeof LEVEL_TONES]}>{riskLevel}</Badge>;
}

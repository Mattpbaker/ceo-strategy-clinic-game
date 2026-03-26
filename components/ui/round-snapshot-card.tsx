import { Radio } from "lucide-react";
import { ReactNode } from "react";

interface SnapshotItem {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "muted";
}

interface RoundSnapshotCardProps {
  title: string;
  subtitle?: string;
  items: SnapshotItem[];
  footer?: ReactNode;
  /** Current round number (1-based) for progress bar */
  currentRound?: number;
  /** Total rounds */
  totalRounds?: number;
}

export function RoundSnapshotCard({
  title,
  subtitle,
  items,
  footer,
  currentRound,
  totalRounds = 6
}: RoundSnapshotCardProps): React.ReactElement {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <article className="card card-prominent snapshot-card">
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Radio size={14} color="var(--accent)" />
          <h2 style={{ fontSize: "0.9rem" }}>{title}</h2>
        </div>
        {subtitle ? <p className="small">{subtitle}</p> : null}
      </div>

      {/* Round progress bar */}
      {currentRound != null && (
        <div className="round-progress" style={{ marginBottom: "0.8rem" }}>
          <span className="round-progress-label">Mission</span>
          <div className="round-progress-segments">
            {rounds.map((r) => (
              <div
                key={r}
                className={`round-segment${r < currentRound ? " filled" : r === currentRound ? " current" : ""}`}
              />
            ))}
          </div>
          <span className="round-progress-label">{currentRound}/{totalRounds}</span>
        </div>
      )}

      <div className="snapshot-grid">
        {items.map((item) => (
          <div className={`snapshot-item tone-${item.tone || "default"}`} key={item.label}>
            <span className="small" style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {item.label}
            </span>
            <b>{item.value}</b>
            {item.hint ? <p className="small">{item.hint}</p> : null}
          </div>
        ))}
      </div>

      {footer ? <div className="snapshot-footer">{footer}</div> : null}
    </article>
  );
}

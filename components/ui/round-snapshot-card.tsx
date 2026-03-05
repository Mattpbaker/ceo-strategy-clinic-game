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
}

export function RoundSnapshotCard({
  title,
  subtitle,
  items,
  footer
}: RoundSnapshotCardProps): React.ReactElement {
  return (
    <article className="card card-prominent snapshot-card">
      <div className="card-head">
        <h2>{title}</h2>
        {subtitle ? <p className="small">{subtitle}</p> : null}
      </div>

      <div className="snapshot-grid">
        {items.map((item) => (
          <div className={`snapshot-item tone-${item.tone || "default"}`} key={item.label}>
            <span className="small">{item.label}</span>
            <b>{item.value}</b>
            {item.hint ? <p className="small">{item.hint}</p> : null}
          </div>
        ))}
      </div>

      {footer ? <div className="snapshot-footer">{footer}</div> : null}
    </article>
  );
}

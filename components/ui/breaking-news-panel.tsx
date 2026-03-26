import { AlertTriangle, Radio } from "lucide-react";
import { RoundEvent } from "@/lib/types";

interface BreakingNewsPanelProps {
  event: RoundEvent | null;
  roundNumber: number | null;
  title?: string;
}

export function BreakingNewsPanel({
  event,
  roundNumber,
  title = "Threat Alert"
}: BreakingNewsPanelProps): React.ReactElement {
  return (
    <article className="card breaking-news">
      <div className="news-banner">
        <span className="news-kicker">
          <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle" }} />
          {title}
        </span>
        {roundNumber ? (
          <span className="badge">Round {roundNumber}</span>
        ) : null}
      </div>

      {event ? (
        <div className={`news-body severity-${event.event.severity}`}>
          <p className="news-headline">{event.event.title}</p>
          <p className="small" style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", letterSpacing: "0.1em" }}>
            {event.event.category.toUpperCase()} &nbsp;|&nbsp; SEVERITY: {event.event.severity.toUpperCase()}
          </p>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>{event.event.narrative}</p>

          {/* Scrolling ticker */}
          <div className="news-ticker">
            <div className="news-ticker-inner">
              ◈ {event.event.title.toUpperCase()} &nbsp;&nbsp;&nbsp;//&nbsp;&nbsp;&nbsp;
              {event.event.category.toUpperCase()} EVENT &nbsp;&nbsp;&nbsp;//&nbsp;&nbsp;&nbsp;
              SEVERITY {event.event.severity.toUpperCase()} &nbsp;&nbsp;&nbsp;
              ◈ MONITOR SITUATION &nbsp;&nbsp;&nbsp;
              ◈ ADAPT STRATEGY &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            </div>
          </div>
        </div>
      ) : (
        <div className="news-empty">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <Radio size={14} style={{ color: "var(--muted)" }} />
            <p className="news-headline" style={{ color: "var(--muted)", fontSize: "1rem" }}>
              No active threats
            </p>
          </div>
          <p className="small">Threat alert will appear once the round event is assigned.</p>
        </div>
      )}
    </article>
  );
}

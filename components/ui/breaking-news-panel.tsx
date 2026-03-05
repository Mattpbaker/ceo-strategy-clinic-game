import { RoundEvent } from "@/lib/types";

interface BreakingNewsPanelProps {
  event: RoundEvent | null;
  roundNumber: number | null;
  title?: string;
}

export function BreakingNewsPanel({
  event,
  roundNumber,
  title = "Breaking News"
}: BreakingNewsPanelProps): React.ReactElement {
  return (
    <article className="card breaking-news">
      <div className="news-banner">
        <span className="news-kicker">{title}</span>
        {roundNumber ? <span className="badge">Round {roundNumber}</span> : null}
      </div>

      {event ? (
        <div className={`news-body severity-${event.event.severity}`}>
          <p className="news-headline">{event.event.title}</p>
          <p className="small">
            {event.event.category.toUpperCase()} | {event.event.severity.toUpperCase()}
          </p>
          <p>{event.event.narrative}</p>
        </div>
      ) : (
        <div className="news-empty">
          <p className="news-headline">No headline yet</p>
          <p className="small">Breaking event will appear here once assigned for this round.</p>
        </div>
      )}
    </article>
  );
}

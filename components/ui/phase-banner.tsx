// components/ui/phase-banner.tsx
"use client";

import { RoundPhase, SessionStatus } from "@/lib/types";

interface PhaseBannerProps {
  phase: RoundPhase;
  sessionStatus: SessionStatus;
  role: "player" | "facilitator";
  decisionsSubmitted?: number;
  totalPlayers?: number;
}

const PHASES: RoundPhase[] = ["pending", "decision", "interaction", "resolved"];

const PHASE_LABELS: Record<RoundPhase, string> = {
  pending: "PENDING",
  decision: "DECISION",
  interaction: "INTERACTION",
  resolved: "RESOLVED",
};

function getStepState(step: RoundPhase, current: RoundPhase): "past" | "current" | "future" {
  const currentIndex = PHASES.indexOf(current);
  const stepIndex = PHASES.indexOf(step);
  if (stepIndex < currentIndex) return "past";
  if (stepIndex === currentIndex) return "current";
  return "future";
}

function getBannerContent(
  phase: RoundPhase,
  sessionStatus: SessionStatus,
  role: "player" | "facilitator",
  decisionsSubmitted?: number,
  totalPlayers?: number,
): { heading: string; body: string; counter?: string } {
  if (sessionStatus === "completed") {
    return role === "player"
      ? { heading: "SIMULATION COMPLETE", body: "Review your final standing below." }
      : { heading: "SESSION COMPLETE", body: "Walk through the timeline and leaderboard with your cohort." };
  }

  const submitted = decisionsSubmitted ?? 0;
  const total = totalPlayers ?? 0;

  switch (phase) {
    case "pending":
      return role === "player"
        ? { heading: "WAITING", body: "Waiting for facilitator to start the session." }
        : { heading: "READY TO START", body: "Start the session when players are ready." };
    case "decision":
      return role === "player"
        ? {
            heading: "DECISION PHASE — SUBMIT YOUR ORDERS",
            body: "Set your budget, focus action, and risk posture below.",
            counter: total > 0 ? `${submitted} / ${total} SUBMITTED` : undefined,
          }
        : {
            heading: "DECISION PHASE",
            body: "Waiting for players to submit decisions.",
            counter: total > 0 ? `${submitted} / ${total} IN` : undefined,
          };
    case "interaction":
      return role === "player"
        ? {
            heading: "INTERACTION PHASE",
            body: "Open Intel Center to propose and respond to deals before the facilitator resolves.",
          }
        : { heading: "INTERACTION PHASE", body: "Review proposals in Intel Center. Advance when ready." };
    case "resolved":
      return role === "player"
        ? { heading: "ROUND RESOLVED", body: "Review your metric outcomes below." }
        : { heading: "ROUND RESOLVED", body: "Advance to the next round when the debrief is complete." };
  }
}

function getBannerPhaseColor(phase: RoundPhase, sessionStatus: SessionStatus): string {
  if (sessionStatus === "completed") return "rgba(0,230,118,0.06)";
  switch (phase) {
    case "pending": return "rgba(107,122,148,0.08)";
    case "decision": return "rgba(255,215,0,0.06)";
    case "interaction": return "rgba(255,107,53,0.06)";
    case "resolved": return "rgba(0,230,118,0.06)";
  }
}

function getBannerBorderColor(phase: RoundPhase, sessionStatus: SessionStatus): string {
  if (sessionStatus === "completed") return "rgba(0,230,118,0.25)";
  switch (phase) {
    case "pending": return "rgba(107,122,148,0.2)";
    case "decision": return "rgba(255,215,0,0.25)";
    case "interaction": return "rgba(255,107,53,0.25)";
    case "resolved": return "rgba(0,230,118,0.25)";
  }
}

function getBannerHeadingColor(phase: RoundPhase, sessionStatus: SessionStatus): string {
  if (sessionStatus === "completed") return "var(--good)";
  switch (phase) {
    case "pending": return "var(--muted)";
    case "decision": return "var(--accent)";
    case "interaction": return "var(--warn)";
    case "resolved": return "var(--good)";
  }
}

export function PhaseBanner({ phase, sessionStatus, role, decisionsSubmitted, totalPlayers }: PhaseBannerProps) {
  const { heading, body, counter } = getBannerContent(phase, sessionStatus, role, decisionsSubmitted, totalPlayers);
  const bgColor = getBannerPhaseColor(phase, sessionStatus);
  const borderColor = getBannerBorderColor(phase, sessionStatus);
  const headingColor = getBannerHeadingColor(phase, sessionStatus);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {/* Phase stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.6rem" }}>
        <span style={{ color: "var(--muted)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>Phase</span>
        <div style={{ display: "flex", alignItems: "center" }}>
          {PHASES.map((step, i) => {
            const state = getStepState(step, sessionStatus === "completed" ? "resolved" : phase);
            const isFirst = i === 0;
            const isLast = i === PHASES.length - 1;
            const radius = isFirst ? "4px 0 0 4px" : isLast ? "0 4px 4px 0" : "0";
            const borderLeft = isFirst ? undefined : "none";

            let bg: string;
            let color: string;
            let border: string;
            let fontWeight: string | undefined;
            let prefix: string;

            if (state === "past") {
              bg = "rgba(0,230,118,0.12)";
              color = "var(--good)";
              border = "1px solid rgba(0,230,118,0.35)";
              prefix = "✓ ";
              fontWeight = undefined;
            } else if (state === "current") {
              bg = phase === "decision" ? "rgba(255,215,0,0.15)"
                : phase === "interaction" ? "rgba(255,107,53,0.15)"
                : phase === "resolved" ? "rgba(0,230,118,0.15)"
                : "rgba(107,122,148,0.15)";
              color = phase === "decision" ? "var(--accent)"
                : phase === "interaction" ? "var(--warn)"
                : phase === "resolved" ? "var(--good)"
                : "var(--muted)";
              border = phase === "decision" ? "1px solid rgba(255,215,0,0.5)"
                : phase === "interaction" ? "1px solid rgba(255,107,53,0.5)"
                : phase === "resolved" ? "1px solid rgba(0,230,118,0.5)"
                : "1px solid rgba(107,122,148,0.3)";
              fontWeight = "700";
              prefix = "● ";
            } else {
              bg = "rgba(107,122,148,0.06)";
              color = "var(--muted)";
              border = "1px solid rgba(107,122,148,0.18)";
              prefix = "";
              fontWeight = undefined;
            }

            return (
              <span
                key={step}
                style={{
                  background: bg,
                  color,
                  border,
                  borderLeft,
                  borderRadius: radius,
                  padding: "0.2rem 0.55rem",
                  fontSize: "0.62rem",
                  letterSpacing: "0.1em",
                  fontWeight,
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                }}
              >
                {prefix}{PHASE_LABELS[step]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Contextual banner */}
      <div
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              color: headingColor,
              fontSize: "0.65rem",
              letterSpacing: "0.14em",
              fontWeight: "700",
              fontFamily: "var(--font-mono)",
              marginBottom: "0.2rem",
            }}
          >
            ⬡ {heading}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{body}</div>
        </div>
        {counter && (
          <div
            style={{
              color: headingColor,
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              textAlign: "right",
              fontWeight: "700",
            }}
          >
            {counter}
          </div>
        )}
      </div>
    </div>
  );
}

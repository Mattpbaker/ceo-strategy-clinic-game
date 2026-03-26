"use client";

import { Shield, Crosshair, Monitor, BookOpen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default function HomePage(): React.ReactElement {
  const router = useRouter();
  const [facilitatorName, setFacilitatorName] = useState("Clinic Facilitator");
  const [sessionCode, setSessionCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [displayCode, setDisplayCode] = useState("");
  const [showBriefing, setShowBriefing] = useState(false);

  async function createSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facilitator_name: facilitatorName })
      });
      const data = (await response.json()) as ApiResponse<{
        session: { id: string; code: string };
        facilitator_token: string;
      }>;

      if (!response.ok || !data.ok || !data.data) {
        throw new Error(data.error || "Unable to create session");
      }

      const code = data.data.session.code;
      setSessionCode(code);
      localStorage.setItem(`ceo-clinic:facilitator:${code}`, data.data.facilitator_token);
      setMessage(`Session created. Share code ${code} with students.`);
      router.push(`/facilitator/${code}?token=${encodeURIComponent(data.data.facilitator_token)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create session");
    } finally {
      setCreating(false);
    }
  }

  async function joinSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setJoining(true);
    setError(null);
    setMessage(null);

    try {
      const code = sessionCode.trim().toUpperCase();
      const response = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname })
      });

      const data = (await response.json()) as ApiResponse<{
        session: { id: string; code: string };
        player: { id: string; nickname: string };
        company: { id: string };
      }>;

      if (!response.ok || !data.ok || !data.data) {
        throw new Error(data.error || "Unable to join session");
      }

      const joined = data.data;
      localStorage.setItem(
        `ceo-clinic:${joined.session.id}:player`,
        JSON.stringify({
          sessionCode: joined.session.code,
          playerId: joined.player.id,
          companyId: joined.company.id,
          nickname: joined.player.nickname
        })
      );

      router.push(`/session/${joined.session.code}?playerId=${joined.player.id}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join session");
    } finally {
      setJoining(false);
    }
  }

  function openDisplay(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const code = displayCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/display/${code}`);
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "1fr auto" }}>
      {/* Full-viewport landing hero */}
      <div className="landing-root">
        <div className="landing-hero">
          <div className="landing-hero-inner">
            {/* Top status line */}
            <div className="landing-status-bar">
              <span className="landing-status-dot" />
              <span>SIMULATION READY</span>
              <span className="landing-status-divider" />
              <span>6 ROUNDS</span>
              <span className="landing-status-divider" />
              <span>15–40 PLAYERS</span>
            </div>

            {/* Title */}
            <h1 className="landing-title">
              CEO<br />
              <span className="landing-title-accent">Strategy</span><br />
              Clinic
            </h1>

            <p className="landing-subtitle">
              Lead a company through world events. Outmaneuver rivals. Build something that lasts.
            </p>

            <div>
              <button
                type="button"
                className="landing-btn-briefing"
                onClick={() => setShowBriefing(true)}
              >
                <BookOpen size={14} />
                Mission Briefing
              </button>
            </div>

            {/* Cards row */}
            <div className="landing-cards">
              {/* Facilitator card */}
              <article className="landing-card">
                <div className="landing-card-header">
                  <Shield size={18} color="var(--accent)" />
                  <span className="landing-card-label">Command Post</span>
                </div>
                <h2 className="landing-card-title">Facilitator Setup</h2>
                <form onSubmit={createSession}>
                  <label htmlFor="facilitatorName">
                    Command designation
                    <input
                      id="facilitatorName"
                      value={facilitatorName}
                      onChange={(event) => setFacilitatorName(event.target.value)}
                      placeholder="Enter designation"
                      required
                    />
                  </label>
                  <button type="submit" disabled={creating} className="landing-btn-primary">
                    {creating ? "Deploying..." : "Deploy Session"}
                  </button>
                </form>
                <p className="small" style={{ marginTop: "0.7rem" }}>
                  Creates a 6-round session. Share the access code with players.
                </p>
              </article>

              {/* Player card */}
              <article className="landing-card landing-card-player">
                <div className="landing-card-header">
                  <Crosshair size={18} color="var(--cyan)" />
                  <span className="landing-card-label" style={{ color: "var(--cyan)", borderColor: "rgba(0,212,255,0.3)" }}>
                    Field Deploy
                  </span>
                </div>
                <h2 className="landing-card-title">Join as Player</h2>
                <form onSubmit={joinSession}>
                  <label htmlFor="sessionCode">
                    Access code
                    <input
                      id="sessionCode"
                      value={sessionCode}
                      onChange={(event) => setSessionCode(event.target.value.toUpperCase())}
                      placeholder="ABC123"
                      required
                      style={{ textTransform: "uppercase", letterSpacing: "0.2em" }}
                    />
                  </label>
                  <label htmlFor="nickname">
                    Call sign
                    <input
                      id="nickname"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="Enter call sign"
                      required
                    />
                  </label>
                  <button type="submit" disabled={joining} className="landing-btn-cyan">
                    {joining ? "Engaging..." : "Enter Simulation"}
                  </button>
                </form>
              </article>

              {/* Display card */}
              <article className="landing-card landing-card-display">
                <div className="landing-card-header">
                  <Monitor size={18} color="#c084fc" />
                  <span className="landing-card-label" style={{ color: "#c084fc", borderColor: "rgba(192,132,252,0.3)" }}>
                    War Room Display
                  </span>
                </div>
                <h2 className="landing-card-title">Open Display</h2>
                <form onSubmit={openDisplay}>
                  <label htmlFor="displayCode">
                    Session code
                    <input
                      id="displayCode"
                      value={displayCode}
                      onChange={(event) => setDisplayCode(event.target.value.toUpperCase())}
                      placeholder="ABC123"
                      required
                      style={{ textTransform: "uppercase", letterSpacing: "0.2em" }}
                    />
                  </label>
                  <button type="submit" className="landing-btn-display">
                    Open Display
                  </button>
                </form>
                <p className="small" style={{ marginTop: "0.7rem" }}>
                  Projector view: live leaderboard and event feed.
                </p>
              </article>
            </div>

            {message ? <p className="notice" style={{ maxWidth: "680px" }}>{message}</p> : null}
            {error ? <p className="error" style={{ maxWidth: "680px" }}>{error}</p> : null}
          </div>
        </div>
      </div>

      {/* Mission Briefing Overlay */}
      {showBriefing && (
        <div className="briefing-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowBriefing(false); }}>
          <div className="briefing-panel">
            <div className="briefing-header">
              <div className="briefing-header-left">
                <span className="briefing-classification">CLASSIFIED — FACILITATOR BRIEF</span>
                <h2 className="briefing-title">Mission Briefing</h2>
              </div>
              <button type="button" className="briefing-close" onClick={() => setShowBriefing(false)} aria-label="Close briefing">
                <X size={20} />
              </button>
            </div>

            <p className="briefing-intro">
              You're about to run a live business simulation. Here's what your players need to know — and what you need to tell them.
            </p>

            <div className="briefing-grid">
              <div className="briefing-card">
                <span className="briefing-num">01</span>
                <h3 className="briefing-card-title">The Stakes</h3>
                <p>This isn't a case study. It's a live competition. Everyone in this room is the CEO of a company — and they're competing against each other in real time. From the moment the session opens, every decision counts.</p>
              </div>

              <div className="briefing-card">
                <span className="briefing-num">02</span>
                <h3 className="briefing-card-title">Six Rounds</h3>
                <p>The simulation runs for six rounds. Each round represents a quarter. A world event drops — economic, political, social. Nobody sees it coming. That's the point. The best CEOs don't just react to crises. They position before them.</p>
              </div>

              <div className="briefing-card">
                <span className="briefing-num">03</span>
                <h3 className="briefing-card-title">Three Decisions</h3>
                <p>Every round, players make three calls: where they allocate their budget across five strategic areas — Growth, People, Resilience, Brand, Compliance — what they focus on, and how much risk they're willing to carry. Simple levers. Infinite combinations.</p>
              </div>

              <div className="briefing-card">
                <span className="briefing-num">04</span>
                <h3 className="briefing-card-title">The Event</h3>
                <p>Once everyone submits, the facilitator triggers the resolution. The world event fires. Your decisions interact with it. Some companies will come out stronger. Some won't. The spread is the lesson.</p>
              </div>

              <div className="briefing-card">
                <span className="briefing-num">05</span>
                <h3 className="briefing-card-title">The Leaderboard</h3>
                <p>Rankings update after every round and broadcast live. Your score reflects overall company performance across all metrics. There's no hiding from it. First place after Round 6 wins. Everyone will know exactly where they stand.</p>
              </div>

              <div className="briefing-card">
                <span className="briefing-num">06</span>
                <h3 className="briefing-card-title">Company Interactions</h3>
                <p>This isn't a solo game. Mid-simulation, players can strike trade deals, launch price wars, poach rivals' talent, or publicly challenge a competitor's reputation. Alliances matter. Enemies matter more. Choose carefully.</p>
              </div>

              <div className="briefing-card briefing-card-full">
                <span className="briefing-num">07</span>
                <h3 className="briefing-card-title">The Edge</h3>
                <p>The players who win don't get lucky. They read the signals in the event description, match their budget to their posture, and pick a focus action that amplifies their strengths. When the event hits, they're already positioned. That's what separates a good quarter from a great company. Find that edge. Use it every round.</p>
              </div>
            </div>

            <div className="briefing-footer">
              <button type="button" className="landing-btn-primary" onClick={() => setShowBriefing(false)}>
                Close Briefing
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .landing-root {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        /* Radial glow bg */
        .landing-root::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 60% at 15% 35%, rgba(255, 215, 0, 0.16), transparent),
            radial-gradient(ellipse 60% 50% at 85% 65%, rgba(0, 212, 255, 0.12), transparent),
            radial-gradient(ellipse 40% 30% at 50% 90%, rgba(255, 107, 53, 0.05), transparent);
          pointer-events: none;
        }

        .landing-hero {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 3rem 2rem;
          position: relative;
          z-index: 1;
        }

        .landing-hero-inner {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          animation: glow-in 500ms ease;
        }

        .landing-status-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .landing-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--good);
          box-shadow: 0 0 8px var(--good-glow);
          animation: blink 2s ease-in-out infinite;
          flex-shrink: 0;
        }

        .landing-status-divider {
          width: 1px;
          height: 10px;
          background: var(--line-hard);
        }

        .landing-title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(4rem, 12vw, 9rem);
          line-height: 0.88;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .landing-title-accent {
          color: var(--accent);
          text-shadow: 0 0 40px rgba(255, 215, 0, 0.6), 0 0 80px rgba(255, 215, 0, 0.25);
        }

        .landing-subtitle {
          margin: 0;
          font-size: clamp(1rem, 2vw, 1.25rem);
          color: var(--muted);
          max-width: 52ch;
          line-height: 1.6;
        }

        .landing-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          max-width: 720px;
        }

        .landing-card-display:hover {
          border-color: rgba(192, 132, 252, 0.4);
          box-shadow: 0 0 30px rgba(192, 132, 252, 0.08);
        }

        .landing-btn-display {
          width: 100%;
          padding: 0.65rem 1rem;
          font-size: 0.8rem;
          letter-spacing: 0.14em;
          border-color: #c084fc;
          color: #c084fc;
          background: rgba(192, 132, 252, 0.08);
        }

        .landing-btn-display:hover {
          background: rgba(192, 132, 252, 0.16);
          box-shadow: 0 0 16px rgba(192, 132, 252, 0.2);
        }

        .landing-card {
          background: rgba(15, 21, 32, 0.9);
          border: 1px solid var(--line-hard);
          border-radius: 10px;
          padding: 1.4rem;
          display: grid;
          gap: 0.6rem;
          backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255, 215, 0, 0.1);
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }

        .landing-card:hover {
          border-color: rgba(255, 215, 0, 0.55);
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.18), inset 0 1px 0 rgba(255, 215, 0, 0.15);
        }

        .landing-card-player:hover {
          border-color: rgba(0, 212, 255, 0.55);
          box-shadow: 0 0 40px rgba(0, 212, 255, 0.18), inset 0 1px 0 rgba(0, 212, 255, 0.15);
        }

        .landing-card-display {
          grid-column: 1 / -1;
        }

        .landing-card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.2rem;
        }

        .landing-card-label {
          font-family: var(--font-mono);
          font-size: 0.68rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
          border: 1px solid rgba(255, 215, 0, 0.25);
          border-radius: 3px;
          padding: 0.1rem 0.4rem;
        }

        .landing-card-title {
          margin: 0 0 0.5rem;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.15rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .landing-btn-primary {
          width: 100%;
          padding: 0.65rem 1rem;
          font-size: 0.8rem;
          letter-spacing: 0.14em;
        }

        .landing-btn-cyan {
          width: 100%;
          padding: 0.65rem 1rem;
          font-size: 0.8rem;
          letter-spacing: 0.14em;
          border-color: var(--cyan);
          color: var(--cyan);
          background: rgba(0, 212, 255, 0.08);
        }

        .landing-btn-cyan:hover {
          background: rgba(0, 212, 255, 0.16);
          box-shadow: 0 0 16px rgba(0, 212, 255, 0.2);
        }

        .landing-btn-briefing {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          font-size: 0.76rem;
          letter-spacing: 0.14em;
          border: 1px solid rgba(255, 215, 0, 0.3);
          background: rgba(255, 215, 0, 0.06);
          color: var(--accent);
          border-radius: 5px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-weight: 600;
          text-transform: uppercase;
          transition: border-color 200ms ease, background 200ms ease, box-shadow 200ms ease;
        }

        .landing-btn-briefing:hover {
          border-color: rgba(255, 215, 0, 0.6);
          background: rgba(255, 215, 0, 0.12);
          box-shadow: 0 0 16px rgba(255, 215, 0, 0.15);
        }

        /* ── MISSION BRIEFING OVERLAY ─── */

        .briefing-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(5, 8, 14, 0.88);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow-y: auto;
          padding: 2rem 1rem 3rem;
          animation: briefing-fade-in 220ms ease;
        }

        @keyframes briefing-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .briefing-panel {
          width: 100%;
          max-width: 900px;
          background: rgba(12, 17, 28, 0.98);
          border: 1px solid rgba(255, 215, 0, 0.25);
          border-radius: 14px;
          padding: 2rem;
          box-shadow: 0 40px 80px rgba(0, 0, 0, 0.7), 0 0 60px rgba(255, 215, 0, 0.06);
          animation: briefing-slide-up 280ms cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }

        .briefing-panel::before {
          content: "";
          position: absolute;
          top: 0;
          left: 2rem;
          right: 2rem;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.5), transparent);
        }

        @keyframes briefing-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .briefing-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }

        .briefing-header-left {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .briefing-classification {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--warn);
          opacity: 0.8;
        }

        .briefing-title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 2rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .briefing-close {
          border: 1px solid rgba(255, 215, 0, 0.2);
          background: rgba(255, 215, 0, 0.06);
          color: var(--muted);
          border-radius: 6px;
          padding: 0.45rem 0.55rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
          flex-shrink: 0;
        }

        .briefing-close:hover {
          color: var(--ink);
          border-color: rgba(255, 215, 0, 0.5);
          background: rgba(255, 215, 0, 0.12);
          box-shadow: none;
          transform: none;
        }

        .briefing-intro {
          margin: 0 0 1.75rem;
          font-size: 1rem;
          color: var(--muted);
          line-height: 1.6;
          border-left: 3px solid rgba(255, 215, 0, 0.4);
          padding-left: 1rem;
        }

        .briefing-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .briefing-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 215, 0, 0.1);
          border-radius: 8px;
          padding: 1.2rem;
          display: grid;
          gap: 0.5rem;
          position: relative;
          transition: border-color 200ms ease, background 200ms ease;
        }

        .briefing-card:hover {
          border-color: rgba(255, 215, 0, 0.25);
          background: rgba(255, 215, 0, 0.03);
        }

        .briefing-card-full {
          grid-column: 1 / -1;
          border-color: rgba(255, 215, 0, 0.2);
          background: rgba(255, 215, 0, 0.03);
        }

        .briefing-card-full:hover {
          border-color: rgba(255, 215, 0, 0.4);
          background: rgba(255, 215, 0, 0.05);
        }

        .briefing-num {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          color: var(--accent);
          opacity: 0.7;
        }

        .briefing-card-title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .briefing-card p {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.65;
          color: var(--muted);
        }

        .briefing-card-full p {
          color: var(--ink);
          opacity: 0.85;
        }

        .briefing-footer {
          margin-top: 1.75rem;
          display: flex;
          justify-content: flex-end;
        }

        @media (max-width: 680px) {
          .landing-cards {
            grid-template-columns: 1fr;
          }

          .landing-hero {
            padding: 2rem 1rem;
          }

          .briefing-grid {
            grid-template-columns: 1fr;
          }

          .briefing-panel {
            padding: 1.25rem;
          }
        }

      `}</style>
    </main>
  );
}

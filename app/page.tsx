"use client";

import { Shield, Crosshair, Monitor } from "lucide-react";
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

        @media (max-width: 680px) {
          .landing-cards {
            grid-template-columns: 1fr;
          }

          .landing-hero {
            padding: 2rem 1rem;
          }
        }

      `}</style>
    </main>
  );
}

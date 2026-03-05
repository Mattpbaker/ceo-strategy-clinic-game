"use client";

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

  return (
    <main className="page">
      <section className="hero">
        <h1>CEO Strategy Clinic</h1>
        <p>
          Multiplayer strategy simulation for entrepreneurship cohorts. Lead a company through world
          events, negotiate with peers, and balance financial outcomes with resilience, people, and
          reputation.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Facilitator Setup</h2>
          <form onSubmit={createSession}>
            <label htmlFor="facilitatorName">
              Facilitator name
              <input
                id="facilitatorName"
                value={facilitatorName}
                onChange={(event) => setFacilitatorName(event.target.value)}
                placeholder="Clinic lead"
                required
              />
            </label>
            <button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Session"}
            </button>
          </form>
          <p className="small">This creates a 6-round session ready for 15-40 participants.</p>
        </article>

        <article className="card">
          <h2>Join as Student</h2>
          <form onSubmit={joinSession}>
            <label htmlFor="sessionCode">
              Session code
              <input
                id="sessionCode"
                value={sessionCode}
                onChange={(event) => setSessionCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                required
              />
            </label>
            <label htmlFor="nickname">
              Nickname
              <input
                id="nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Alex"
                required
              />
            </label>
            <button type="submit" disabled={joining}>
              {joining ? "Joining..." : "Join Session"}
            </button>
          </form>
        </article>
      </section>

      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

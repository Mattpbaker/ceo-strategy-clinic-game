"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useEffect, useRef, useState } from "react";

export type SessionRealtimeStatus = "offline" | "connecting" | "live";

interface UseSessionRealtimeOptions {
  sessionId: string | null | undefined;
  channelKey: string;
  tables: string[];
  onChange: () => void | Promise<void>;
}

interface UseSessionRealtimeResult {
  status: SessionRealtimeStatus;
  backoffMs: number | null;
}

export function useSessionRealtime(options: UseSessionRealtimeOptions): UseSessionRealtimeResult {
  const { sessionId, channelKey, tables, onChange } = options;
  const [status, setStatus] = useState<SessionRealtimeStatus>("offline");
  const [backoffMs, setBackoffMs] = useState<number | null>(null);
  const [reconnectTick, setReconnectTick] = useState(0);

  const onChangeRef = useRef(onChange);
  const retryAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase || !sessionId) {
      setStatus("offline");
      setBackoffMs(null);
      return;
    }

    setStatus("connecting");

    const scheduleRefresh = (): void => {
      if (debounceTimerRef.current) {
        return;
      }

      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void onChangeRef.current();
      }, 120);
    };

    const scheduleReconnect = (): void => {
      if (reconnectTimerRef.current) {
        return;
      }

      const delay = Math.min(30_000, 1_000 * 2 ** retryAttemptRef.current);
      retryAttemptRef.current += 1;
      setBackoffMs(delay);

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        setReconnectTick((value) => value + 1);
      }, delay);
    };

    const channel = supabase.channel(`${channelKey}:${sessionId}:${reconnectTick}`);

    for (const table of tables) {
      const filter = table === "sessions" ? `id=eq.${sessionId}` : `session_id=eq.${sessionId}`;
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter
        },
        scheduleRefresh
      );
    }

    channel.subscribe((realtimeStatus) => {
      if (realtimeStatus === "SUBSCRIBED") {
        retryAttemptRef.current = 0;
        setBackoffMs(null);
        setStatus("live");
        return;
      }

      if (
        realtimeStatus === "CHANNEL_ERROR" ||
        realtimeStatus === "TIMED_OUT" ||
        realtimeStatus === "CLOSED"
      ) {
        setStatus("offline");
        scheduleReconnect();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelKey, reconnectTick, sessionId, tables]);

  return { status, backoffMs };
}

do $$ begin
  alter publication supabase_realtime add table sessions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table players;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table companies;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table rounds;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table round_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table decisions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table interaction_proposals;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table interaction_responses;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table score_snapshots;
exception when duplicate_object then null;
end $$;

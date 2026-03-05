create table if not exists company_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  round_number int not null,
  company_id uuid not null references companies(id) on delete cascade,
  metrics jsonb not null,
  total_score numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists company_metric_snapshots_session_round_idx
  on company_metric_snapshots(session_id, round_number, created_at);

create index if not exists company_metric_snapshots_company_round_idx
  on company_metric_snapshots(company_id, round_number, created_at);

do $$ begin
  alter publication supabase_realtime add table company_metric_snapshots;
exception when duplicate_object then null;
end $$;

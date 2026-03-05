create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  facilitator_name text not null,
  status text not null check (status in ('waiting','running','paused','completed')),
  total_rounds int not null default 6,
  current_round_number int not null default 1,
  seed text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  nickname text not null,
  role text not null default 'player',
  created_at timestamptz not null default now(),
  unique(session_id, nickname)
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  name text not null,
  metrics jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_number int not null,
  phase text not null check (phase in ('pending','decision','interaction','resolved')),
  started_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(session_id, round_number)
);

create table if not exists event_cards (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('economic','social','political')),
  severity text not null check (severity in ('low','medium','high')),
  title text not null,
  narrative text not null,
  effects jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists round_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  event_card_id uuid not null references event_cards(id),
  source text not null check (source in ('deck','facilitator')),
  created_at timestamptz not null default now(),
  unique(round_id)
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(round_id, player_id)
);

create table if not exists interaction_proposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  proposer_company_id uuid not null references companies(id) on delete cascade,
  target_company_id uuid not null references companies(id) on delete cascade,
  type text not null check (type in ('trade_contract','joint_venture','price_war','talent_poach','reputation_challenge')),
  terms jsonb not null,
  status text not null check (status in ('pending','accepted','rejected','countered','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists interaction_responses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references interaction_proposals(id) on delete cascade,
  responder_company_id uuid not null references companies(id) on delete cascade,
  response text not null check (response in ('accept','reject','counter')),
  counter_terms jsonb,
  created_at timestamptz not null default now()
);

create table if not exists score_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  breakdown jsonb not null,
  created_at timestamptz not null default now()
);

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

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  actor text not null,
  action text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);

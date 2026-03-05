alter table sessions
  add column if not exists facilitator_token_hash text;

create index if not exists sessions_code_idx on sessions(code);

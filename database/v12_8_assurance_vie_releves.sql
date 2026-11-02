-- V12.8 - Relevés hebdomadaires assurance-vie après le dernier versement
alter table public.pret_life_insurance_contracts
  add column if not exists interest_keys jsonb not null default '{}'::jsonb,
  add column if not exists last_interest_on date,
  add column if not exists last_interest_bank_date date,
  add column if not exists discord_url text,
  add column if not exists discord_posted_at timestamptz,
  add column if not exists discord_message_id text,
  add column if not exists discord_notices jsonb not null default '[]'::jsonb,
  add column if not exists mission_keys jsonb not null default '{}'::jsonb;

comment on column public.pret_life_insurance_contracts.interest_keys is
  'Accusés des relevés Discord placement:{YYYY-MM-DD} après le dernier versement.';

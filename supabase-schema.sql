-- BrandWeave Supabase setup
-- Run this once in Supabase Dashboard -> SQL Editor -> New query.

create table if not exists public.brandweave_records (
  id uuid primary key,
  owner_uid text not null,
  collection text not null check (collection in ('sources', 'reviews', 'audit')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brandweave_records_owner_collection_updated_idx
  on public.brandweave_records (owner_uid, collection, updated_at desc);

alter table public.brandweave_records enable row level security;

-- Browser roles receive no table access. The Express server uses a Supabase
-- secret/service-role key only after verifying the Firebase Auth ID token.
revoke all on table public.brandweave_records from anon, authenticated;
grant select, insert, update, delete on table public.brandweave_records to service_role;

-- Private bucket for source documents. Access is performed only by the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brandweave-sources',
  'brandweave-sources',
  false,
  4194304,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown', 'text/csv',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 4194304,
  allowed_mime_types = excluded.allowed_mime_types;

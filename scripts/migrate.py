import os

from supabase import create_client

TABLE_SQL = """
create extension if not exists pgcrypto;

create table if not exists public.conversion_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  original_filename text,
  output_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
    error text
);

create table if not exists public.conversion_job_files (
    id bigserial primary key,
    batch_id uuid not null references public.conversion_jobs(id) on delete cascade,
    file_id text not null,
    original_name text not null,
    source_ext text not null,
    source_path text not null,
    target_format text not null,
    status text not null,
    output_path text,
    output_filename text,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists conversion_jobs_created_at_idx on public.conversion_jobs (created_at desc);
create index if not exists conversion_jobs_status_idx on public.conversion_jobs (status);
create index if not exists conversion_job_files_batch_id_idx on public.conversion_job_files (batch_id);
create index if not exists conversion_job_files_file_id_idx on public.conversion_job_files (file_id);
create index if not exists conversion_job_files_output_filename_idx on public.conversion_job_files (output_filename);
"""


def _rpc_execute_sql(supabase, sql: str) -> bool:
    # This expects one of these SQL-executor RPCs to exist in your Supabase project.
    for rpc_name, args in (
        ("exec_sql", {"sql": sql}),
        ("execute_sql", {"query": sql}),
        ("execute_sql", {"sql": sql}),
    ):
        try:
            supabase.rpc(rpc_name, args).execute()
            return True
        except Exception:
            continue
    return False


def main() -> None:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

    supabase = create_client(supabase_url, supabase_key)

    if not _rpc_execute_sql(supabase, TABLE_SQL):
        raise RuntimeError(
            "Could not run migration SQL through Supabase RPC. "
            "Create an RPC (exec_sql or execute_sql) that runs service-role SQL, then re-run this script."
        )

    try:
        buckets = supabase.storage.list_buckets()
        if "conversions" not in {bucket.name for bucket in buckets}:
            supabase.storage.create_bucket("conversions", {"public": False})
    except Exception as exc:
        raise RuntimeError(
            "Migration created/verified table, but bucket creation failed. "
            "Create storage bucket 'conversions' in Supabase dashboard."
        ) from exc

    print("Migration complete: conversion_jobs table and conversions bucket are ready.")


if __name__ == "__main__":
    main()

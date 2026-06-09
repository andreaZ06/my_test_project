# Supabase SKU Storage Setup

This project stores SKU configuration in Supabase when Supabase environment variables are present. Local development still falls back to `backend/data/store.json`.

## 1. Create Table

Open Supabase SQL Editor and run:

```sql
create table if not exists public.app_config (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

## 2. Vercel Environment Variables

Add these variables in Vercel Project Settings > Environment Variables:

```text
SUPABASE_URL=your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=your Supabase service role key
SUPABASE_CONFIG_TABLE=app_config
SUPABASE_STORE_ID=maifudi-store
```

Use the service role key only on the server side. Do not expose it in frontend code.

## 3. How It Works

- `GET /api/skus` reads `app_config.value` where `id = maifudi-store`.
- `POST /api/skus` and `PUT /api/skus` update the same row.
- `POST /api/reviews/realtime-sync` reads the same Supabase-backed SKU list before crawling JD reviews.
- If Supabase variables are missing, the backend uses local JSON storage.

## 4. Verify

After Vercel redeploys:

1. Add or edit a SKU in the dashboard.
2. Refresh the Vercel site.
3. The SKU should remain changed.
4. In Supabase Table Editor, check `public.app_config`; there should be a row with `id = maifudi-store`.

# Alfarooq Services

Educational courses platform with admin panel, Supabase PostgreSQL database, and Supabase Storage for all media files.

## Stack

- Next.js 15 (App Router)
- PostgreSQL via Supabase + Prisma
- Supabase Storage (bucket: `uploads`)
- Vercel deployment

## Supabase Setup

1. Create a Supabase project
2. Create a **private** storage bucket named `uploads`
3. Run SQL migrations:
   - `supabase/migrations/001_initial_schema.sql` — database tables
   - `supabase/migrations/002_storage_bucket.sql` — storage policies
4. Or use Prisma: `npx prisma migrate deploy`

## Environment Variables

Copy `.env.example` to `.env.local` and fill values from Supabase:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled Postgres URL (port 6543) |
| `DIRECT_URL` | Direct Postgres URL (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `SUPABASE_STORAGE_BUCKET` | `uploads` |
| `JWT_SECRET` | Random secret for admin sessions |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin password |

## Local Development

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run sync-admin
npm run dev
```

## Vercel Deployment

1. Push repo to GitHub
2. Import project in Vercel (Framework: **Next.js**)
3. **Install Command:** `npm install`
4. **Build Command:** `prisma generate && next build`
5. Add all environment variables from `.env.example` in Vercel → Settings → Environment Variables
6. **Optional speed tip:** set Vercel project region to **Singapore (sin1)** — Supabase DB is in ap-southeast-1; closer region = faster admin/login/saves

**Important — connection strings (Supabase Dashboard → Database → Connect):**

| Variable | Supabase mode | Port |
|----------|---------------|------|
| `DATABASE_URL` | Transaction pooler | 6543 + `?pgbouncer=true` |
| `DIRECT_URL` | Session pooler | 5432 on `pooler.supabase.com` |

Do **not** use `db.xxx.supabase.co:5432` as `DIRECT_URL` on Vercel — build/runtime often cannot reach it (P1001).

**Database tables:** run once in Supabase SQL Editor before first deploy:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_storage_bucket.sql`

Then seed admin locally: `npm run db:seed` (with `.env` set), or insert admin via Supabase.

## Admin Access

- URL: `/admin/login`
- Footer link also available (navbar button removed intentionally)

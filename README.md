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
6. **Function region:** `vercel.json` pins functions to **Singapore (`sin1`)**, the
   same AWS region as the Supabase DB (ap-southeast-1). Without it Vercel used
   Washington (`iad1`) and every DB round trip crossed the Pacific. Hobby plans
   allow exactly one region, so keep the list at one entry.

**Important — connection strings (Supabase Dashboard → Database → Connect):**

| Variable | Supabase mode | Port |
|----------|---------------|------|
| `DATABASE_URL` | Transaction pooler | 6543 + `?pgbouncer=true` |
| `DIRECT_URL` | Session pooler | 5432 on `pooler.supabase.com` |

Do **not** use `db.xxx.supabase.co:5432` as `DIRECT_URL` on Vercel — build/runtime often cannot reach it (P1001).

The app talks to `DATABASE_URL` through Prisma's `pg` driver adapter
(`src/lib/prisma.ts`), which sends each query in one round trip. The
`pgbouncer=true` flag is only read by Prisma CLI tools; the app strips it.
`DIRECT_URL` is still used by `prisma migrate`.

**Database tables:** run once in Supabase SQL Editor before first deploy:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_storage_bucket.sql`

Then seed admin locally: `npm run db:seed` (with `.env` set), or insert admin via Supabase.

## Admin Access

- URL: `/admin/login`
- Footer link also available (navbar button removed intentionally)

## Office Module (cases / payments / commissions)

Internal case-management sub-system at `/office` (same DB, same login). Full
design, business rules, roadmap and agent log live in `docs/office-module/`.

- Roles: super admin (existing `admin`), `cashier`, `attestation`, `booking_office`
  (shareholders = several booking_office logins on one office). Created from
  `/admin/sub-admins` (super admin only).
- Files (payment slips) go to **Cloudflare R2**, not Supabase. Create a private R2
  bucket, an API token with object read/write, and set in `.env` / Vercel:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Department files (printing proof, attestation files, videos) upload **directly
  from the browser to R2** with signed URLs, because Vercel functions reject
  request bodies over 4.5 MB. The bucket therefore needs a CORS rule for the site
  origin. The app tries to add it itself on the first upload (works only if the R2
  token has admin/bucket permission). Otherwise add it once in Cloudflare →
  R2 → bucket → Settings → CORS Policy:

  ```json
  [
    {
      "AllowedOrigins": ["https://YOUR-SITE-DOMAIN"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["content-type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

  Without this rule, files still upload through the server: up to 4 MB in one
  request, photos are shrunk by the browser to fit, and any file up to 10 MB is
  sent in 3 MB chunks (`POST /api/office/cases/[id]/files/chunks`) and joined on
  R2. Only videos bigger than 10 MB need the CORS rule (clear error otherwise).
- Expected printing date uses the bot AI configured in Admin → Settings (falls back
  to weekend-only skipping when no AI key is set); override from `/office/setup`.
- Migration: `prisma/migrations/20261001120000_office_module/migration.sql`
  (`npx prisma migrate deploy`, or paste into the Supabase SQL editor).
- Optional defaults: `npx tsx scripts/seed-office-defaults.ts`
- Smoke test against a running server: `npx tsx scripts/test-office.ts`

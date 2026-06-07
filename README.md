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
2. Import project in Vercel
3. Add all environment variables from `.env.example`
4. Deploy — `vercel.json` runs migrations on build

## Admin Access

- URL: `/admin/login`
- Footer link also available (navbar button removed intentionally)

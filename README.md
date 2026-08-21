# Aveska Intelligence

Internal vehicle-based customer cross-sell and marketing intelligence platform for Aveska.

This is not a generic recommendation engine. Compatibility is established from vehicle/application data extracted from orders and the product catalogue. Products are never recommended only because they share a category.

V1 generates, previews, approves, and can bulk-send campaigns over SMTP or Maropost. Export CSV/XLSX still works.

## Installation

```bash
npm install
```

## Environment setup

Copy `.env.example` to `.env` and set values:

```bash
copy .env.example .env
```

Required:

- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — long random string for Auth.js

Optional:

- `AI_PROVIDER` / `AI_API_KEY` — leave as `none` to use the built-in template writer
- `EMAIL_PROVIDER` — `export` (no send), `smtp`, or `maropost`
- `SMTP_FROM` / `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` — required for SMTP send
- `MAROPOST_ACCOUNT_ID` / `MAROPOST_API_KEY` — required when `EMAIL_PROVIDER=maropost`

## Database setup

PostgreSQL is required. This machine does not have Docker, so use the local Scoop install:

```bash
pg_ctl start
createdb -U postgres aveska
npx prisma migrate deploy
npm run db:seed
```

If Postgres is already running, skip `pg_ctl start`. Stop it later with `pg_ctl stop`.

Docker alternative (if you install Docker Desktop later):

```bash
docker compose up -d
```

Then set `DATABASE_URL` to `postgresql://aveska:aveska@localhost:5432/aveska?schema=public`.

Default admin login after seed:

- Email: `admin@aveska.local`
- Password: `change-me`

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional background worker (imports also process in-request):

```bash
npm run worker
```

## Production build

```bash
npm run build
npm start
```

## Deploy on Railway

The app stays online 24/7 (no `track:tunnel` on your PC). You need a **GitHub repo** or the Railway CLI.

1. In [Railway](https://railway.app), **New Project → Database → PostgreSQL**.
2. **New → GitHub Repo** (or `railway up`) and deploy this app into the same project.
3. On the app service **Variables**, add:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
AUTH_SECRET=<long random string>
AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
TRACKING_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_key
SMTP_FROM=hello@aveska.com.au
SMTP_FROM_NAME=Aveska
ADMIN_EMAIL=admin@aveska.local
ADMIN_PASSWORD=<strong password, not change-me>
NETO_API_URL=https://www.aveska.com.au/do/WS/NetoAPI
NETO_API_KEY=<from local .env>
NETO_API_USERNAME=<from local .env>
```

Rename `Postgres` in `DATABASE_URL` if your database service has a different name.

4. **Settings → Networking → Generate Domain**. Redeploy once `AUTH_URL` can resolve.
5. Migrations run automatically (`npx prisma migrate deploy` before each start). Seed once from Railway **Settings → one-off command**:

```bash
npx tsx prisma/seed.ts
```

6. Sign in, set **Settings → Public app URL** to that same Railway https URL, then send campaigns. Click tracking
   works worldwide while Railway is running, with your PC off. Do not use a trycloudflare tunnel — those hostnames die
   when they restart and cannot be repaired in already-sent emails.

Do not commit `.env`. Railway Hobby cannot send Gmail SMTP; use Resend (HTTPS) as above, or upgrade to Pro.

## Importing orders

1. Go to **Imports**
2. Choose **Orders**
3. Upload 3 months of CSV/XLSX
4. Confirm column mapping
5. Review the import summary (valid rows, duplicates, missing email/product)

Sample file: `fixtures/sample-orders.csv`

## Importing catalogue

1. Go to **Imports**
2. Choose **Catalogue**
3. Upload CSV/XLSX/JSON
4. Map make/model/series/fitment fields when present
5. The catalogue becomes the source of truth for recommendations

Sample file: `fixtures/sample-catalogue.csv`

## Generating recommendations

Click **Analyse customers** on the dashboard. This:

1. Extracts vehicle/application data
2. Builds customer vehicle profiles
3. Matches catalogue products by fitment
4. Excludes purchased SKUs, out-of-stock items, and incompatible vehicles
5. Writes human-readable reasons and confidence scores

## Generating campaigns

1. Review recommendations
2. Open **Campaigns** or a customer/vehicle page
3. Click **Generate campaign**
4. Preview desktop/mobile email
5. Approve
6. Send a test, then **Send emails**, or export CSV/XLSX

Bulk send stays off until `EMAIL_PROVIDER` is `smtp` or `maropost` in `.env`.

## Tests

```bash
npm test
```

## Demo mode

Sign in and click **Run demo**. It loads the Ford XB/XC fixture, generates recommendations, and creates a reviewable campaign. The Toyota LandCruiser product must not be recommended to the Ford customer.

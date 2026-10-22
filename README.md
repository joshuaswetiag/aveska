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

`npm run build` writes the Vite client to `dist/`. `npm start` serves that client and the API on one port.

## Deploy on Cloudflare

The public site is the Vite app. Cloudflare cannot reach PostgreSQL on your PC, so production needs a hosted database (Neon, Supabase, or another public Postgres) attached with [Hyperdrive](https://developers.cloudflare.com/hyperdrive/).

1. Create the hosted Postgres database and set `DATABASE_URL` to it. Apply the schema and seed once:

```bash
npx prisma migrate deploy
npm run db:seed
```

2. Log in and create a Worker from this repo:

```bash
npx wrangler login
```

In the [Cloudflare dashboard](https://dash.cloudflare.com), create a Worker, connect [joshuaswetiag/aveska](https://github.com/joshuaswetiag/aveska), and attach Hyperdrive to that database. Build command: `npm run build`. The static client is `dist/`.

3. Set these secrets to the Worker or custom-domain `https` URL:

```text
DATABASE_URL=<hosted Postgres URL, via Hyperdrive>
AUTH_SECRET=<long random string>
AUTH_URL=https://<your-worker-or-domain>
TRACKING_URL=https://<your-worker-or-domain>
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

4. Put uploaded import files in [R2](https://developers.cloudflare.com/r2/). Run background jobs with a [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/). The local server writes uploads to disk and polls jobs in-process; Workers cannot do either.
5. Sign in and set **Settings → Public app URL** to that same `https` URL before sending campaigns. Click tracking uses that host. Do not use a trycloudflare tunnel — those hostnames die when they restart, and links already sent cannot be repaired.

Do not commit `.env`. Use Resend for mail. SMTP ports are blocked from Workers, so Gmail SMTP stays a local-only option.

The Worker entry (Hyperdrive, R2, and Cron) is not wired in this repo yet. Connecting the GitHub repo publishes the Vite client. API routes, jobs, and uploads still run with `npm start` until that Worker adapter lands.

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

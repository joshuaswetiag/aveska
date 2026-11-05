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

- `DATABASE_URL` — local SQLite file URL, e.g. `file:./prisma/dev.db`
- `AUTH_SECRET` — long random string for Auth.js

Optional:

- `AI_PROVIDER` / `AI_API_KEY` — leave as `none` to use the built-in template writer
- `EMAIL_PROVIDER` — `resend` (Cloudflare), `export` (no send), `smtp` (local only), or `maropost`
- `RESEND_API_KEY` / `SMTP_FROM` — required for Resend send
- `MAROPOST_ACCOUNT_ID` / `MAROPOST_API_KEY` — required when `EMAIL_PROVIDER=maropost`

## Database setup

Local development uses SQLite (same engine as Cloudflare D1):

```bash
npx prisma migrate deploy
npm run db:seed
```

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

Hosting is Cloudflare-only: **Workers** (Vite `dist/` + API), **D1** (SQLite), **R2** (import uploads), **Cron** (job queue). Mail uses **Resend** (Workers block SMTP).

1. Log in and create D1 + R2:

```bash
npx wrangler login
npx wrangler d1 create aveska
npx wrangler r2 bucket create aveska-uploads
```

Paste the returned D1 `database_id` into `wrangler.toml` (`[[d1_databases]].database_id`).

2. Apply the schema to D1:

```bash
npm run cf:migrate
```

For a local Miniflare D1: `npm run cf:migrate:local`.

3. Seed production once (fresh D1). Easiest path: seed local SQLite, then copy critical rows, or run `npm run db:seed` against a temporary local file and re-import. For a brand-new deploy, seed locally for testing and create the admin user on D1 with the same password hash from your local `User` row, or re-run seed against a throwaway SQLite file and use Wrangler to insert that row.

4. Build and deploy:

```bash
npm run deploy
```

5. Set Worker secrets (and `AUTH_URL` / `TRACKING_URL` to the public `https` URL):

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUTH_URL
npx wrangler secret put TRACKING_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SMTP_FROM
npx wrangler secret put SMTP_FROM_NAME
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put NETO_API_KEY
npx wrangler secret put NETO_API_USERNAME
```

`EMAIL_PROVIDER=resend` is already in `wrangler.toml` `[vars]`.

6. Sign in and set **Settings → Public app URL** to that same `https` URL before sending campaigns. Click tracking uses that host.

Do not commit `.env`. Use Resend for mail on Cloudflare; Gmail SMTP stays local-only (`npm run dev` / `npm start`).

Cron runs every 2 minutes (`wrangler.toml` `[triggers]`) and drains up to 5 queued jobs via `processNextJob`. Locally, keep using `npm run worker` or in-request `/api/jobs/.../process`.

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

# Aveska Intelligence: Code Audit follow-up, 5 November 2026

**Same-evening update, included in this commit:** login is rate-limited; approval only accepts draft or generated campaigns; a campaign that has already sent is archived instead of deleted; export blocks read-only users and no longer changes campaign status; CSV cells that start with `=`, `+`, `-`, or `@` are escaped; eBay addresses are not added as recipients; quote orders are not treated as live purchases; old generated recommendations are replaced when scoring runs again; cooldown uses the latest purchase; an explicit fitment can match across a make mismatch; demo data refuses to write into a live catalogue; the recommendation job runs instead of being cancelled; the SMTP test script reads `TEST_EMAIL` instead of a hardcoded Gmail address. The tables below were written before that pass. Where they disagree with this note, this note is the later one.

**Code checked:** the working tree after the Workers/D1 commit `13caa69`, plus the uncommitted fixes made the same evening. This is not a new commit, and it has not been deployed.
**Previous report:** `CODE_AUDIT_2026-11-05.md`, which audited `13caa69` against `CODE_AUDIT_2026-10-25.md`.
**How this pass was done:** every finding in that report was re-read against the current files. `npx tsc --noEmit` and `npm test` were run. The app was not deployed, and it was not run against the live D1 database or the Neto API.

---

## 1. Summary

The 5 November report left **0 of 67 earlier findings fully fixed**, and added **24 new findings**. This pass closes the three critical email/auth holes enough to send mail without the old forgeable-secret, script-injection, and missing-unsubscribe failures, and it closes the Workers failures that stopped campaigns, vehicle matching, and job recovery.

It does **not** make the app ready for a full production cut-over. CSV import still cannot succeed on the live Worker until the R2 bucket is created and the binding in `wrangler.toml` is uncommented. There is a Postgres copy script, but it has not been run. Several whole-table reads remain. Money is still a floating-point column. `xlsx` and the unused `next` packages are still in the production audit.

| | 5 Nov report | After this pass |
|---|---|---|
| Earlier findings fixed | 0 | 8 |
| Earlier findings partly fixed | 4 | 14 |
| Earlier findings still open | 52 | 45 |
| New findings fixed | 0 | 9 |
| New findings partly fixed | 0 | 12 |
| New findings still open | 24 | 3 |

### Check results

| Check | 5 Nov (`13caa69`) | This working tree |
|---|---|---|
| `npx tsc --noEmit` | Passes (route loader typed as `any`) | Passes |
| `npm test` | 51 passed | 51 passed |
| `npx eslint src tests scripts` | 7 errors, 10 warnings | 7 errors, 10 warnings (same `setState`-in-effect errors, `prefer-const` in `src/server/main.ts`, and `require()` in `scripts/start-production.js`) |
| `npm audit --omit=dev` | 13 (1 critical, 10 high, 2 moderate) | Not re-run after moving `wrangler` to `devDependencies`. The lockfile still records the old tree until `npm install`. `xlsx` and unused `next` remain. |
| Deployed to Cloudflare | Previous Worker | No. These fixes are local only. |

---

## 2. New findings (N-1 to N-24)

**Status key:** ✅ fixed in this working tree · 🟡 partly fixed · ❌ still open.

| ID | Status | What is true now |
|---|---|---|
| N-1 | 🟡 | A send on Workers no longer depends on `setImmediate`. The job stays `QUEUED`, the cron and the job page pick it up again, and each recipient is claimed in the database before the provider is called. Resend gets `Idempotency-Key: aveska-{recipientId}`. The campaign stays `SENDING` only while the batch is paused, so suppressed and eBay rows no longer pin it there. There is still no Cloudflare Queue. A crash after the provider accepts the message and before the row is marked sent can try again after 90 seconds; the idempotency key is what stops a second delivery. |
| N-2 | ✅ | Campaign generation loads order lines in batches of 90 customer ids. The vehicle page uses the same batch size. |
| N-3 | ✅ | Vehicle, fitment, and customer-vehicle inserts go through `createManyIgnoreDuplicates`, which only swallows unique-constraint errors. |
| N-4 | 🟡 | After orders, the Worker sync matches product fitments, links customer vehicles, then builds recommendations 20 customers at a time. Recommendation scoring still loads the product catalogue (without `originalData`). |
| N-5 | 🟡 | The cron does not pick `FAILED` jobs, and one thrown job does not abort the rest of that minute. A Neto sync is retried at most 4 times, with a back-off stored on the job, then left `FAILED`. Opening the app will not put it back after that. |
| N-6 | 🟡 | `scripts/migrate-postgres-to-d1.ts` reads Postgres (`POSTGRES_URL`, package `pg`) and inserts through Prisma in batches of 80, including suppressions. It has not been run. The README no longer tells you to copy a local SQLite file into D1. |
| N-7 | 🟡 | A Worker upload throws if `UPLOADS` is not bound, and a finished import deletes the file. The R2 binding in `wrangler.toml` is still commented out, because the bucket was never created (Cloudflare error 10042). CSV import on the live Worker still cannot succeed until that bucket exists. |
| N-8 | 🟡 | ID lists in the vehicle prune and the vehicle page are chunked. Dashboard order dates are read 500 at a time, but the counts are still accumulated for every order. Data-quality still walks every order line. Recommendation generation still loads every product. |
| N-9 | 🟡 | A stale `RUNNING` job is reclaimed only when `id`, `status`, and `updatedAt` all match. Unique constraints on `Order`, `Product.skuNormalized`, and `Customer.emailNormalized` were not added. |
| N-10 | 🟡 | Checkpoint writes use `where: { status: "RUNNING" }`, so a cancelled sync is not put back by a chunk that is still finishing. A failed full sync is resumed from its payload until 5 attempts, not restarted at product page 0. |
| N-11 | ✅ | `createManyIgnoreDuplicates` rethrows anything that is not a unique conflict, and recommendation generation counts `inserted`. |
| N-12 | 🟡 | Search, the order report, and list pages trim the LIKE text to 48 bytes. Order-import product names are matched case-insensitively for ASCII. There is no new normalised name column, so non-ASCII case folding is still SQLite's default. |
| N-13 | 🟡 | Duplicate email and SKU cards count every group and only cap the samples at 8. Blank emails, names, and product titles use `trim()`. Opportunities group by make and name. |
| N-14 | ❌ | The two migration folders are still updated by different commands. No CI check compares them. |
| N-15 | ❌ | Prices and totals are still SQLite `REAL`. Changing them to integer cents needs a migration of live D1 rows and was not done. |
| N-16 | ✅ | `POST /api/jobs/:id/process` checks the session and rejects `READONLY` before the 202 response. |
| N-17 | 🟡 | The Worker catch-all returns `{ error: "Internal error" }` and logs the real message. Some route handlers (bootstrap, job status, mail settings) still put `error.message` in the JSON body. |
| N-18 | 🟡 | On Workers, a missing or default `AUTH_SECRET` throws. If the User table is empty and `ADMIN_PASSWORD` is set to something other than `change-me`, the first request creates that admin and does not reset it later. Local development still accepts the fallback secret. |
| N-19 | ✅ | Order sync stops on an empty page, not a short one. |
| N-20 | ✅ | A Worker full sync queued without `NETO_ORDERS_FROM` uses an 18-month window. The checkpoint message during orders no longer says "live products". |
| N-21 | 🟡 | The "eBay skipped" count no longer includes suppressed customers. eBay addresses can still be stored as campaign recipients and can still appear in an export. |
| N-22 | ✅ | `clickedAt` and the campaign click counter are set on the first click only. |
| N-23 | ✅ | `startJobWorker()` and `runJobInBackground()` return immediately when `AVESKA_RUNTIME=worker`. |
| N-24 | 🟡 | `wrangler` is a `devDependency` in `package.json`. `@cloudflare/workers-types` already was. `dist/` is in `.gitignore`. Run `npm install` before trusting `npm audit --omit=dev`. |

---

## 3. Earlier findings

| ID | Status | Note |
|---|---|---|
| C-1 | 🟡 | Production and Worker sessions no longer sign with the hardcoded secret. The local fallback remains. The first admin is created from secrets instead of copying a `change-me` hash, and an existing password is not overwritten. |
| C-2 | ✅ | `renderEmailHtml` escapes names, body, and prices, and only allows `http`/`https` URLs. The preview iframe is `sandbox=""`, so stored HTML cannot run script in the admin browser. |
| C-3 | ✅ | Tracked mail adds an unsubscribe link. Resend and SMTP send `List-Unsubscribe`. `GET /t/{id}/unsubscribe` writes a suppression and sets `isSuppressed`. |
| H-1 | 🟡 | Same remaining gap as N-1. A recipient is claimed before send, and the provider call carries an idempotency key. Two isolates can no longer both claim the same job row (N-9). |
| H-2 | ✅ | Read-only users receive 403 from the process route and from the Worker before a job starts. |
| H-3 | 🟡 | Updating an existing product skips null and empty mapped fields, so an unmapped column no longer wipes what is already stored. A blank mapped cell also will not clear a value. |
| H-4 | ✅ | `d/m/y` and `d-m-y` are parsed as Australian dates before `Date.parse`. An impossible day or month is rejected. |
| H-5 | 🟡 | Rows that share an `externalId` add a line to that order and do not add the order total again. Rows with no order id still create one order each. |
| H-6 | 🟡 | Unchanged from the 5 Nov note. Login is checked before the body on Workers, and Cloudflare caps the body. `XLSX.read` can still run twice. |
| H-7 | ✅ | Aliases match on word boundaries, so a short alias no longer matches inside another word. |
| H-8 | ✅ | A negative fitment or a make/series override applies only to that vehicle. A negative override with no make and no series is still a ban for every vehicle. |
| H-9 | ❌ | Generating recommendations with `resume` only fills customers who have none. Existing rows are not scored again. |
| H-10 | ❌ | Merge still has no D1 transaction. Not changed. |
| H-11 | 🟡 | See N-5. The Node `setInterval` worker still polls every 2 seconds, but it no longer starts inside a Worker request. |
| H-12 | ✅ | Global search ignores a non-JSON or failed response instead of throwing on `res.json()`. |
| H-13 | ❌ | `xlsx` is still the unpatched SheetJS build. `next`, `next-auth`, and `@auth/*` are still dependencies. |
| M-1 | 🟡 | Worker 500s are generic. Several route handlers still return the exception text. |
| M-2 | ❌ | No login rate limit. |
| M-3 | ❌ | Sessions still cannot be revoked. |
| M-4 | ❌ | Export is still a state-changing GET, and the read-only check on that route was not added. |
| M-5 | 🟡 | Unchanged. A caller can still point the SMTP test at a host and the saved password is sent there. Workers cannot reach private addresses. |
| M-6 | ❌ | Mail secrets are still stored in the database. |
| M-7 | ❌ | Approval still does not check campaign status. |
| M-8 | ❌ | Deleting a campaign still cascades send history. |
| M-9 | ❌ | Test sends can still be tracked against a real customer. |
| M-10 | ❌ | Export can still repeat one product on every row. |
| M-11 | ❌ | Campaign generation is still not idempotent and has no frequency cap. |
| M-12 | ❌ | CSV formula injection is unchanged. |
| M-13 | ❌ | SMTP can still be configured without TLS. Resend is the Worker default. |
| M-14 | ❌ | Suppression import and the unchecked import type are unchanged. |
| M-15 | ❌ | No unique keys were added. Two sync chunks can still insert duplicate orders if they ever run the same page. |
| M-16 | 🟡 | Pages checkpoint and resume. There is still no fetch timeout, and one bad record fails the chunk. |
| M-17 | ❌ | Duplicate customers are unchanged. |
| M-18 | ❌ | Cancelled and quote orders are still counted, and the updated-orders pass is still off by default. |
| M-19 | ❌ | `send-test-email.ts` was not changed. |
| M-20 | ❌ | Series codes shared by two makes are unchanged. |
| M-21 | ✅ | Body-type words use the same word-boundary match as makes and aliases. |
| M-22 | ❌ | Make detection can still prefer a longer alias over an earlier one. |
| M-23 | ❌ | A fitment still cannot override a make mismatch. |
| M-24 | ❌ | Cooldown still uses the purchase list as stored, not an explicit "latest purchase" query. |
| M-25 | ❌ | The queue still marks `GENERATE_RECOMMENDATIONS` cancelled ("paused") while the full-sync phase does run recommendations. A standalone recommendation job does not run. |
| M-26 | 🟡 | Re-extraction no longer crashes on unique rows (N-3). It still only adds links; it does not remove ones that no longer match. |
| M-27 | ❌ | Demo data can still be written into the live catalogue. |
| M-28 | 🟡 | API errors are JSON. A Cloudflare HTML error page can still break `res.json()`. |
| M-29 | ❌ | The data-loading race is unchanged. |
| M-30 | 🔄 | The gate still opens at 400 products and 25 orders. With no Neto key and no data, the user stays on the loading screen. |
| L-1 | ❌ | Customer detail still includes `originalData`. |
| L-2 | 🟡 | Dashboard month counts are paged, then summed in the Worker. The full date list is still held in memory. |
| L-3 | ❌ | Request bodies are still largely unvalidated. |
| L-4 | 🟡 | The Worker catch-all no longer returns raw Prisma text. Other routes still do. |
| L-5 | 🟡 | The first click time is kept (N-22). Concurrent increments can still race. |
| L-6 | ❌ | The missing foreign-key indexes were not added. |
| L-7 | 🟡 | Neto reads are per page. Many writes are still one row at a time. |
| L-8 | 🟡 | The Worker path resumes. The Node path can still stop early. |
| L-9 | ❌ | Unchanged. |
| L-10 | 🟡 | Import files are deleted after a successful import. They are never stored on Workers until R2 is bound (N-7). |
| L-11 to L-16 | ❌ | Unchanged, including `neto-count.ts`. |
| L-17 | 🟡 | `dist/` is gitignored. `docker-compose.yml` for Postgres is still in the repo. |
| L-18 to L-21 | ❌ | Unchanged. |
| §6 Deploy target | 🟡 | Sends and syncs resume from the cron inside Worker time limits. R2 is still not bound. `railway.json` is still in the repo. |
| §6 Next.js leftovers | ❌ | `next`, `next-auth`, `@auth/prisma-adapter`, `next.config.ts`, `src/middleware.ts`, and the NextAuth route are still present. |
| §6 tsc, lint, CI | 🟡 | `tsc` passes. Lint is still 7 errors and 10 warnings. There is still no CI workflow. |
| §6 One process | 🟡 | Worker requests do not start a `setInterval` job loop. Recovery is the cron, plus an open job page re-queueing `QUEUED` work. |
| §6 Bundle size | ❌ | The client chunk warning is unchanged. `npm run build` was not re-run. |
| §7 Tests | ❌ | No new tests for D1 limits, chunk resume, or the routes. The existing 51 tests pass. |

---

## 4. What still blocks real use

1. **Do not send a large campaign from the currently deployed Worker.** These send fixes are only in the working tree.
2. **Turn on R2** (bucket `aveska-uploads`, uncomment `UPLOADS` in `wrangler.toml`) before any CSV import on Workers.
3. **Do not copy `prisma/dev.db` into D1.** Use `scripts/migrate-postgres-to-d1.ts` against the old Postgres URL if that data is still available.
4. **D1's free daily write quota** was already exhausted on 5 November. A deploy will not move the stuck order sync until the quota resets or the plan is upgraded. When it does, requeue the existing `NETO_SYNC` job without resetting `orderPage`.
5. Still open, and still able to corrupt data or mail the wrong people: **H-5** (orders with no id), **H-9**, **M-4**, **M-11**, **M-14**, **M-15**, **M-17**, **M-18**, **H-13**.

---

## 5. Not done, on purpose

- Cloudflare Queues were not added. Sends resume from the existing cron and from `POST /api/jobs/:id/process`.
- Decimal money was not converted to integer cents (N-15). That rewrites every price already stored in D1.
- Unique indexes were not added on top of live data that may already contain duplicates (N-9, M-15).
- Next.js packages were not removed (H-13 and the leftovers section). Removing them is a dependency change, not a behaviour fix, and `npm audit` still needs a lockfile refresh.

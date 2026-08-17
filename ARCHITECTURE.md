# Architecture

## Data flow

1. Admin uploads orders and catalogue files.
2. Column detection proposes a mapping; the admin confirms it.
3. Rows are imported without destroying originals (`originalData` / `nameRaw` retained).
4. Duplicate rows are counted and skipped; missing email/product is flagged.
5. **Analyse customers** extracts vehicles from product text and catalogue fields.
6. Canonical `Vehicle` records and aliases are upserted.
7. `CustomerVehicle` profiles are created per distinct application. Ford parts never mix with Toyota parts for the same customer.
8. The matching engine scores catalogue products against each customer vehicle.
9. Eligible recommendations (confidence ≥ threshold, vehicle compatibility present) can be included in campaigns.
10. Campaign generation personalizes email copy via the AI provider abstraction (template fallback when no API key).
11. Admin reviews, edits, approves, then sends over SMTP/Maropost or exports.

## Vehicle extraction

`src/lib/vehicle/extract.ts` is rule-based and deterministic.

Signals (highest first):

- Explicit catalogue fields (make, model, series, fitment, application)
- Australian bootstrap dictionary (Falcon/Holden/LandCruiser/Valiant series, etc.)
- Learned makes/series/aliases from imported catalogue and the alias manager
- `to suit` / `fits` phrasing, body types, year ranges

The bootstrap dictionary is **not** the closed list of supported vehicles. Catalogue imports and admin aliases extend it.

Extraction never invents a vehicle. Low-confidence results stay on **Needs review**.

## Recommendation engine

`src/lib/recommendation/score.ts` implements the published scoring table:

| Signal | Points |
| --- | --- |
| Exact make | +40 |
| Exact series set | +40 |
| Partial series overlap | +30 |
| Same vehicle family | +20 |
| Body type | +10 |
| Year overlap | +10 |
| Fitment text | +25 |
| Explicit compatibility | +30 |
| Same category (never sufficient alone) | +5 |
| Purchased SKU in cooldown | -100 |
| Out of stock | -100 |
| Insufficient fitment | -80 |

Rules:

- Different make → reject
- No vehicle signal on the product → "Insufficient fitment data"
- Category-only → do not recommend
- Admin fitment overrides beat extraction
- Score is normalized to 0–100 and shown with reasons

## AI layer

`src/lib/ai/provider.ts`

- `TemplateAiProvider` — default, no network, no PII beyond first name + vehicle
- `OpenAiCompatibleProvider` — optional; sends first name, vehicle, series, and product names only

Never send passwords, emails, or full order history to an LLM.

## Campaign system

`src/lib/campaign/generate.ts`

- Loads approved/generated recommendations
- Drops suppressed / bounced / DNC addresses
- Caps three products per customer, scoped to one vehicle
- Renders HTML with product cards
- Optional UTM query params on copies of product URLs (canonical catalogue URL is unchanged)
- Status: Draft → Generated → In review → Approved → Exported

`src/lib/email/smtp.ts` sends personalized HTML via SMTP or Maropost Marketing Cloud SMTP. `EMAIL_PROVIDER=export` keeps sending disabled.

## Jobs

Database-backed jobs (`Job` table) for import, extraction, recommendations, campaign generation, and demo. `processNextJob` can run from an API request or `npm run worker`.

## Auth and roles

Auth.js credentials provider. Roles: `ADMIN`, `MARKETING`, `READONLY`.

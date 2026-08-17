# Aveska Intelligence — admin guide

This tool helps Aveska recommend restoration parts that actually fit a customer’s vehicle, then prepare and send a marketing email after review.

## Sign in

Use the account your administrator created. The development seed account is `admin@aveska.local`.

## Typical weekly workflow

1. **Imports → Orders** — upload the last three months of orders (Excel or CSV). Check the column mapping. Names in your file can differ from ours; choose the matching field from the list.
2. **Imports → Catalogue** — upload the current Aveska product list. If the file has Make / Series / Fitment columns, map them. That data is the source of truth.
3. **Dashboard → Analyse customers** — wait until the job finishes.
4. **Cross-Sell Opportunities** — open a vehicle group such as Ford XB/XC.
5. Open a customer. Confirm the vehicle profile and the recommended parts. Every card explains why it was recommended.
6. If a recommendation is wrong, mark **Incorrect fitment** or **Not relevant**.
7. **Generate campaign**, preview on desktop and mobile, edit if needed, **Approve**.
8. **Send test** to yourself, then **Send emails**. Or **Export XLSX** if you still want to send from another tool.

Suppressed people, missing emails, and already-sent recipients are skipped. Failed rows can be retried with Send emails again.

## What “vehicle based” means

If John bought *Front Bucket Seat Belts to suit Ford XB XC Sedan*, the system looks for other catalogue products that fit **Ford Falcon XB/XC Sedan**. It will not recommend a Toyota LandCruiser panel, and it will not recommend every seat belt in the catalogue.

If fitment cannot be proven, you will see **Insufficient fitment data**. Those products stay out of campaigns until someone adds a fitment override.

## Demo

**Run demo** loads sample Ford XB/XC data and a sample campaign so you can click through the flow without uploading files.

## Suppression

Import an unsubscribe list under **Imports → Suppression list**. Suppressed people never appear in campaign exports. Order history is kept.

## Aliases

If the system misses “Falcon XB” as Ford XB, add it under **Vehicles → Alias manager**.

## Roles

- **Admin** — everything, including settings
- **Marketing** — imports, analysis, campaigns, exports
- **Read-only** — view only

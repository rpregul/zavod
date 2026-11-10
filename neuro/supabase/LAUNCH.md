# Subscription launch: 299 RUB per calendar month

Source: rpregul/zavod, neuro/. Frontend changes remain disabled until launch checks pass.

## Prepared infrastructure

- Additive schema: billing.sql. Existing profiles and results retained.
- Service-only billing RPC, expiring opaque sessions, server-side amount and access checks.
- Edge Function: neuro-billing (index.ts and core.js). Provider credentials stay in runtime secrets.
- Five-minute renewal/reconciliation worker, with private DB-generated authorization secret.
- Renewal reminder via Resend 24 hours ahead. Set RESEND_API_KEY and NZ_MAIL_FROM (verified sender). Renewals wait for a successfully submitted reminder and a 24-hour notice period.
- Cancel stops renewal; paid access stays until paid_until. A failed renewal stops automatic attempts.
- Ambiguous provider creation older than 20 hours is placed in review, never blindly charged again.
- Each confirmed payment is queued for a manual NPD receipt (nz_payments.receipt_status='required').

## Merchant setup

1. Confirm the YooKassa store contract is active and recurring payments are enabled for this store.
2. Start with a TEST store. In Supabase → Edge Functions → Secrets set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.
3. Test keys work without enabling live payments, after checking /me.test=true. NZ_PAYMENTS_ENABLED=false disables all payment calls; true enables live credentials only after launch review.
4. YooKassa HTTP notifications URL:
   https://qucwykwlhipjnbeljuvq.supabase.co/functions/v1/neuro-billing/webhook
   Subscribe to payment.succeeded and payment.canceled.
5. Test checkout, saved method, real provider cancellation, webhook replay, renewal, declined renewal and customer cancellation.
6. Only then switch to live store credentials and verify the live configuration. No raw card data is stored by the application.

## Remaining launch requirements

Seller confirmed by owner: Суханова Ольга Леонидовна, INN 691108496809 (merchant screenshot). Support: plotnikov.csh@gmail.com. Expert: Евгения Киргизова, преподаватель нейробиологии. offer.html and privacy.html are DRAFT documents, explicitly marked as such; finalize storage/support arrangements before publishing commercial terms. Current Supabase region is Frankfurt; do not claim Russian-localized storage.

2026-11-10: actual YooKassa payment.succeeded notification verified on __qa_webhook_20261110: webhook_received_at and applied_at populated automatically; no polling was used for that payment. Both QA accounts have auto_renew=false after verification.

- Publish offer.html and privacy.html with verified seller legal name, INN, support address and actual processor/storage details.
- Offer must describe 299 RUB monthly recurring charges, explicit consent, calendar-month period, cancellation and refund process.
- Add support/recovery process for a forgotten username/PIN before accepting paid customers.
- Confirm a compliant primary storage location and personal-data handling before collecting customer details.
- Move commercial hosting away from GitHub Pages (its terms exclude commercial SaaS).
- Set BILLING.enabled=true only on the verified commercial deployment.
- Revoke browser EXECUTE on nz_login, nz_pull and nz_push (activation SQL at end of billing.sql).
- Remove public debug access, retain migrated sessions and verify existing data migration.
- For existing offline-only results, choose how to import pre-subscription history with the owner.
- Verify email receipt workflow. YooKassa no longer sends NPD receipts automatically; issue each through My Tax or a separately selected NPD service.
- Verify automatic renewal stays healthy with production monitoring/backups and the selected Supabase plan; an auto-paused database cannot sustain subscriptions.

## Validation

node --test neuro/supabase/functions/neuro-billing/core.test.mjs

Run billing.test.sql on the prepared database; all synthetic records roll back.

2026-11-10: test store 1525814 verified by GET /me (test=true). Hosted checkout of 299 RUB succeeded using YooKassa's documented test card; saved payment method confirmed, paid access issued. Accelerated renewal of the dedicated __qa_billing_20261110 account also succeeded for 299 RUB. No real money was charged. HTTP-notification delivery and frontend flow remain to be verified; provider reconciliation was invoked through the protected worker. Email reminder timing in the accelerated test was simulated on the QA account only.

## Rollback

Disable NZ_PAYMENTS_ENABLED first (stops new provider requests); keep webhook reconciliation available during a controlled incident recovery.
Disable BILLING.enabled for source rollback only with owner approval, since that removes the frontend paywall.
Never delete payments/subscriptions to undo a deployment. Reconcile outstanding provider payments and refunds separately.

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
3. NZ_PAYMENTS_ENABLED=true enables provider calls. Leave absent/false outside controlled tests until launch.
4. YooKassa HTTP notifications URL:
   https://qucwykwlhipjnbeljuvq.supabase.co/functions/v1/neuro-billing/webhook
   Subscribe to payment.succeeded and payment.canceled.
5. Test checkout, saved method, real provider cancellation, webhook replay, renewal, declined renewal and customer cancellation.
6. Only then switch to live store credentials and verify the live configuration. No raw card data is stored by the application.

## Remaining launch requirements

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

## Rollback

Disable NZ_PAYMENTS_ENABLED first (stops new provider requests); keep webhook reconciliation available during a controlled incident recovery.
Disable BILLING.enabled for source rollback only with owner approval, since that removes the frontend paywall.
Never delete payments/subscriptions to undo a deployment. Reconcile outstanding provider payments and refunds separately.

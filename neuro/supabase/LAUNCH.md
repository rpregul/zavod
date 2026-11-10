# Subscription launch: individual 299 RUB / family 599 RUB per calendar month

Source: rpregul/zavod, neuro/. Frontend changes remain disabled until launch checks pass.

2026-11-10 rollout: subscription UI enabled on main; real charges still require NZ_PAYMENTS_ENABLED=true and verified live merchant credentials. Frontend versioned module imports avoid mixing old cached modules. Browser QA could not reach the direct Supabase hostname; a fixed-destination API proxy is deployed at neuro-api-rpreguls-projects.vercel.app. It stores no application records and forwards only whitelisted client actions with their own session authorization; internal worker/webhook/diagnostic routes remain direct. Source is in neuro/api-proxy. The proxy is currently on the Vercel project/plan available in the connected account; confirm appropriate commercial hosting/plan as part of final launch arrangements.

## Prepared infrastructure

- Additive schema: billing.sql. Existing profiles and results retained.
- Service-only billing RPC, expiring opaque sessions, server-side amount and access checks.
- Edge Function: neuro-billing (index.ts and core.js). Provider credentials stay in runtime secrets.
- Five-minute renewal/reconciliation worker, with private DB-generated authorization secret.
- Renewal reminder via Resend 24 hours ahead. Set RESEND_API_KEY and NZ_MAIL_FROM (verified sender). Renewals wait for a successfully submitted reminder and a 24-hour notice period.
- Cancel stops renewal; paid access stays until paid_until. A failed renewal stops automatic attempts.
- Ambiguous provider creation older than 20 hours is placed in review, never blindly charged again.
- Each confirmed payment is queued for a manual NPD receipt (nz_payments.receipt_status='required').
- First full trial: one ordered pass through sch_f, sch_r, dob, mem. Server tracks progression and allows interrupted sessions to resume. Future exercises are not automatically added to the trial.
- Family plan: owner plus three invited profiles, private per-person results, 7-day single-use invitations, removal/leave/revocation, inherited access until the owner's paid term ends.
- Personal exercise feedback is in js/recommendations.js. Absolute cutoffs remain null until expert validation; the current comparison uses the user's earlier attempts, not clinical norms. A two-week comparison is offered without a guaranteed magnitude of benefit.

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

2026-11-10: test store 1525814 verified by GET /me (test=true). Hosted checkout of 299 RUB succeeded using YooKassa's documented test card; saved payment method confirmed, paid access issued. Accelerated renewal of the dedicated __qa_billing_20261110 account also succeeded for 299 RUB. No real money was charged. HTTP notification delivery was subsequently verified separately; the new full frontend flow remains to be checked end to end. Email reminder timing in the accelerated test was simulated on the QA account only.

2026-11-10: transactional access.test.sql passed: ordered four-exercise trial, duplicate result retry, second trial rejection, immutable family amount 599 RUB, owner plus three members, invitation replay rejection, separate results, member cannot cancel owner billing, cancellation preserves family access until expiry. The offer preview at the separate neuro-design-preview Vercel project uses example data and makes no payment calls. Mobile 390px plan choice and family checkout form visually checked.

## Rollback

Disable NZ_PAYMENTS_ENABLED first (stops new provider requests); keep webhook reconciliation available during a controlled incident recovery.
Disable BILLING.enabled for source rollback only with owner approval, since that removes the frontend paywall.
Never delete payments/subscriptions to undo a deployment. Reconcile outstanding provider payments and refunds separately.

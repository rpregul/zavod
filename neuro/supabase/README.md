# Reminder release

Apply `reminders.sql`, deploy `functions/neuro-reminders` with `deno.json`, run `select nz_private.invoke_reminder_job()` once to initialize VAPID keys, then apply `reminders-schedule.sql`. The function authenticates the scheduler with a private job token; `verify_jwt=false` is intentional for this custom-auth endpoint. Public browser RPC validates the app session and never returns private keys or push subscriptions.

VAPID keys are generated inside the worker and stored in the private database schema. Do not print, commit, or rotate them during a normal deployment. Existing opt-in subscriptions would stop working after a key rotation.

`reminders.test.sql` uses rolled-back fixtures; it sends no HTTP requests. `rounded-sale.sql` upgrades the existing campaign to integer checkout amounts and a fresh consent version; prior orders retain their amount.

The full guest goal/recommendation algorithm remains pending product review. Do not restore automatic percentages or manual point targets for guests without approval.

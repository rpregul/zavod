-- Invoke the worker every five minutes. It cannot charge while NZ_PAYMENTS_ENABLED is absent/false.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('neuro-renewals','*/5 * * * *',$job$
  select net.http_post(
    url := 'https://qucwykwlhipjnbeljuvq.supabase.co/functions/v1/neuro-billing/renew',
    headers := jsonb_build_object('Content-Type','application/json','x-nz-job-token',
      (select value from nz_private.job_secret where id)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);

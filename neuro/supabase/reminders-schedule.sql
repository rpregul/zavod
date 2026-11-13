select cron.schedule('neuro-training-reminders','*/5 * * * *','select nz_private.invoke_reminder_job();');

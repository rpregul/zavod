create index if not exists events_test_gestures on nz_metrics.events(visitor_id,session_id) where event='commerce' and target='test_visit_skip' and user_key is not null;
create view nz_metrics.test_visits as
select distinct e.visitor_id,e.session_id,e.user_key from nz_metrics.events e
where e.event='commerce' and e.target='test_visit_skip' and e.user_key is not null
and exists(select 1 from nz_metrics.events x where x.visitor_id=e.visitor_id and x.session_id=e.session_id and x.user_key=e.user_key and x.event='exercise' and x.target in ('intro_sch_f','intro_sch_r','intro_colors'));
create view nz_metrics.report_events as select e.* from nz_metrics.events e where not exists(select 1 from nz_metrics.test_visits t where (t.session_id,t.visitor_id)=(e.session_id,e.visitor_id));
create view nz_metrics.report_visitors as select v.* from nz_metrics.visitors v where not exists(select 1 from nz_metrics.test_visits t where t.visitor_id=v.id) or exists(select 1 from nz_metrics.report_events e where e.visitor_id=v.id);
create view nz_metrics.report_trials as select tr.* from public.nz_trials tr where not exists(select 1 from nz_metrics.test_visits t join nz_metrics.events e using(visitor_id,session_id) where t.user_key=tr.user_key group by t.visitor_id,t.session_id having tr.started_at between min(e.created_at)-interval '5 seconds' and max(e.created_at)+interval '5 seconds');
create view nz_metrics.report_visits as select d.* from nz_metrics.visits d where not exists(select 1 from nz_metrics.events e join nz_metrics.test_visits t using(session_id,visitor_id) where t.visitor_id=d.visitor_id and (e.created_at at time zone 'Europe/Moscow')::date=d.day) or exists(select 1 from nz_metrics.report_events e where e.visitor_id=d.visitor_id and (e.created_at at time zone 'Europe/Moscow')::date=d.day);
create view nz_metrics.report_visit_hours as select h.* from nz_metrics.visit_hours h where not exists(select 1 from nz_metrics.events e join nz_metrics.test_visits t using(session_id,visitor_id) where t.visitor_id=h.visitor_id and e.created_at>=h.hour and e.created_at<h.hour+interval '1 hour') or exists(select 1 from nz_metrics.report_events e where e.visitor_id=h.visitor_id and e.created_at>=h.hour and e.created_at<h.hour+interval '1 hour');
revoke all on nz_metrics.test_visits,nz_metrics.report_events,nz_metrics.report_visitors,nz_metrics.report_trials,nz_metrics.report_visits,nz_metrics.report_visit_hours from public,anon,authenticated;
do $$ declare r record; s text; begin
for r in select oid from pg_proc where pronamespace='nz_metrics'::regnamespace and proname in ('behavior_report','funnel_report','traffic_report','landing_report') loop
s:=pg_get_functiondef(r.oid);
s:=replace(replace(replace(replace(replace(s,'nz_metrics.events','nz_metrics.report_events'),'nz_metrics.visitors','nz_metrics.report_visitors'),'public.nz_trials','nz_metrics.report_trials'),'nz_metrics.visits','nz_metrics.report_visits'),'nz_metrics.visit_hours','nz_metrics.report_visit_hours');
execute s;
end loop;end $$;

insert into nz_metrics.reading_texts(id,words,answers) values
('postcards-v1',185,'[0,1,2]'::jsonb),
('bakery-v1',191,'[1,0,2]'::jsonb),
('birds-v1',199,'[0,1,2]'::jsonb),
('routes-v1',258,'[0,1,2,0]'::jsonb),
('exhibition-v1',263,'[1,0,2,1]'::jsonb),
('seedbank-v1',275,'[2,0,1,2]'::jsonb)
on conflict(id) do nothing;

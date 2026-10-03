// Облачная синхронизация (Supabase).
// Если url или key пустые, приложение работает полностью локально, данные лежат в браузере.
// Проект Supabase: neuro-zaryadka (eu-central-1). Схема: supabase/schema.sql, заметки: supabase/README.md
export const CLOUD = {
  url: globalThis.NZ_CLOUD?.url || 'https://qucwykwlhipjnbeljuvq.supabase.co',
  // anon public key (он публичный по дизайну, безопасность держится на RPC-функциях)
  key: globalThis.NZ_CLOUD?.key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1Y3d5a3dsaGlwam5iZWxqdXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNDYxNTMsImV4cCI6MjEwNjYyMjE1M30.GHdPr9oHVvXuHbBIJQudKnF_li05PcBWCGo5N3lp8sw',
};

export const APP_VERSION = '1.0.0';

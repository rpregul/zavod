// Облачная синхронизация (Supabase).
// Пока url и key пустые, приложение работает полностью локально, данные лежат в браузере.
// Как включить общую базу: supabase/README.md
export const CLOUD = {
  url: globalThis.NZ_CLOUD?.url || '',   // https://xxxx.supabase.co
  key: globalThis.NZ_CLOUD?.key || '',   // anon public key (он публичный по дизайну, безопасность держится на RPC-функциях)
};

export const APP_VERSION = '1.0.0';

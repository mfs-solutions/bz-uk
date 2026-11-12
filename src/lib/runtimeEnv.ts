type RuntimeEnv = {
  VITE_MARKET?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  PROD?: boolean;
};

const server = (globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined } };
}).Deno;

export const runtimeEnv: RuntimeEnv = (import.meta as ImportMeta & { env?: RuntimeEnv }).env ?? {
  VITE_MARKET: 'GB',
  VITE_SUPABASE_URL: server?.env.get('SUPABASE_URL'),
  VITE_SUPABASE_ANON_KEY: server?.env.get('SUPABASE_ANON_KEY'),
  PROD: true,
};

export const serverSupabaseKey = server?.env.get('SUPABASE_SERVICE_ROLE_KEY');

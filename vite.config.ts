import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Fail the build if required VITE_* env vars are missing. */
function envGuard(required: string[], hasSupabasePublicKey: boolean): Plugin {
  return {
    name: 'env-guard',
    configResolved(config) {
      if (config.command !== 'build') return;
      const missing = required.filter(k => !config.env[k]);
      if (!hasSupabasePublicKey) {
        missing.push('SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, or VITE_SUPABASE_ANON_KEY');
      }
      if (missing.length) {
        throw new Error(
          `\n❌ Build aborted — missing env variable(s): ${missing.join(', ')}\n` +
          `   Create a .env file (see .env.example) or set them in your CI environment.\n`
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const supabasePublicKey =
    env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || env.VITE_SUPABASE_ANON_KEY?.trim();

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabasePublicKey || ''),
    },
    plugins: [
      react(),
      envGuard(['VITE_SUPABASE_URL'], Boolean(supabasePublicKey)),
      {
        name: 'uk-public-url-guard',
        configResolved(config) {
          if (config.command !== 'build' || config.env.VITE_MARKET !== 'GB') return;
          if (!config.env.VITE_PUBLIC_APP_URL) {
            throw new Error(
              '\nBuild aborted — set VITE_PUBLIC_APP_URL to the UK storefront public origin in the Amplify environment.\n'
            );
          }
        },
      },
      {
        name: 'security-headers',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            // Security headers for development
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
            next();
          });
        },
      },
    ],
    base: '/',
    esbuild: {
      // Strip debugger statements and verbose console logs in production
      drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
      pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug'] : [],
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false, // Disable source maps in production for security
      rollupOptions: {
        output: {
          manualChunks: {
            // Code splitting for better performance
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['lucide-react', 'react-icons'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 5173,
      strictPort: false,
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      },
    },
    preview: {
      port: 4173,
      strictPort: false,
    },
  };
})

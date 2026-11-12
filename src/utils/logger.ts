/**
 * Logger utility — console-only (no external services)
 */

const isDevelopment = import.meta.env.MODE === 'development';

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) console.log('[INFO]', ...args);
  },

  debug: (...args: any[]) => {
    if (isDevelopment) console.debug('[DEBUG]', ...args);
  },

  warn: (...args: any[]) => {
    if (isDevelopment) console.warn('[WARN]', ...args);
  },

  error: (error: Error | string, context?: Record<string, any>) => {
    if (isDevelopment) console.error('[ERROR]', error, context);
  },

  auth: (event: string, userId?: string) => {
    if (isDevelopment) console.log('[AUTH]', event, userId);
  },

  api: (method: string, endpoint: string, status?: number) => {
    if (isDevelopment) console.log('[API]', method, endpoint, status);
  },

  setUser: (_user: { id: string; email?: string; role?: string } | null) => {
    // no-op: external tracking removed
  },
};

export default logger;

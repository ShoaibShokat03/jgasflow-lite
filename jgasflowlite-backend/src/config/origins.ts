/**
 * CORS origins.
 *
 *   CORS_ORIGINS=https://app.example.com,https://admin.example.com
 *   CORS_ORIGINS=*            (any origin, development only)
 *   unset                     local development ports
 */
const DEFAULT_ORIGINS = ['http://localhost:5002', 'http://127.0.0.1:5002', 'http://localhost:5003', 'http://127.0.0.1:5003', 'http://localhost:4173'];

export function getAllowedOrigins(envOrigins?: string): string[] {
  const raw = envOrigins?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  if (raw === '*') return ['*'];
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

export function getCorsConfig(envOrigins?: string) {
  const allowed = getAllowedOrigins(envOrigins);
  return {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // No Origin header: same-origin, curl, server-to-server.
      if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  };
}

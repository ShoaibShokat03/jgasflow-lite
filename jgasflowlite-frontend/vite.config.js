import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Each build gets an id; version.json lets open tabs see that a newer build is live (src/lib/update.jsx).
const BUILD_ID = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const versionFile = () => ({
  name: 'jgf-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_ID }) });
  },
});

// API location comes from VITE_API_URL. In dev /api is proxied to the local API.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), versionFile()],
    define: { __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev') },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5002,
      strictPort: true,
      host: true,
      proxy: { '/api': { target: env.VITE_DEV_API_TARGET || 'http://localhost:5000', changeOrigin: true } },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\/](react|react-dom|scheduler|react-router|react-router-dom)[\/]/.test(id)) return 'react';
            if (/[\/](@tanstack|axios)[\/]/.test(id)) return 'data';
            return undefined;
          },
        },
      },
    },
  };
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2017',
    rollupOptions: {
      output: {
        // Split node_modules into stable vendor chunks so returning users cache
        // Firebase/React across deploys and only re-download changed app code.
        // App code (incl. the lazy-loaded AdminPanel) stays in its own chunks.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase') || id.includes('@firebase')) return 'firebase';
            if (id.includes('/react') || id.includes('/scheduler')) return 'react-vendor';
            return 'vendor';
          }
        },
      },
    },
  },
});

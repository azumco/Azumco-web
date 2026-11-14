import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Keep large libraries in their own cacheable chunks
        manualChunks(id) {
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
          if (/node_modules[\/](motion|framer-motion|motion-dom|motion-utils)[\/]/.test(id)) return 'motion';
        },
      },
    },
  },
});

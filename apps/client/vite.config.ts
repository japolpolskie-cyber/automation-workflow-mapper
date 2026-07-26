import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],

  // Required kapag nilo-load ang production UI gamit ang file://
  base: './',

  server: {
    port: 5174,

    // Huwag tahimik na lumipat sa 5174 kapag occupied ang 5173.
    strictPort: true,
  },
});
import { defineConfig } from 'vite';
import { localApi } from './server/local-api.js';

export default defineConfig({
  // Credentials belong in the deployment environment, never a Vite env file.
  envDir: false,
  plugins: [localApi()],
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 8717, strictPort: true },
});

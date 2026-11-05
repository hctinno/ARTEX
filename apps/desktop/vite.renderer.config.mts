import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devCspPlugin } from './vite.dev-csp.mjs';
export default defineConfig({ plugins: [devCspPlugin(), react(), tailwindcss()] });

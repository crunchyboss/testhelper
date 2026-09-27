import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base: works on GitHub Pages under /<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
});

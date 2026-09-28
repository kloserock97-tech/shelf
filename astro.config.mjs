import { defineConfig } from 'astro/config';

// Served from https://kloserock97-tech.github.io/shelf/
export default defineConfig({
  site: 'https://kloserock97-tech.github.io',
  base: '/shelf',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Astro 7 strips whitespace by JSX rules by default; keep the markup as written.
  compressHTML: false,
  devToolbar: { enabled: false }
});

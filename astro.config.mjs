import { defineConfig } from 'astro/config';

// Served from https://kloserock97-tech.github.io/shelf/
export default defineConfig({
  site: 'https://kloserock97-tech.github.io',
  base: '/shelf',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Astro 7 strips whitespace by JSX rules by default; keep the markup as written.
  compressHTML: false,
  // Kinds renamed on 29.09: Components became Controls, Motion went into Galleries, Apps into 3D & WebGL.
  // Destinations carry the base themselves: Astro does not add it to redirect targets.
  redirects: {
    '/type/component': '/shelf/type/control/',
    '/type/motion': '/shelf/type/gallery/',
    '/type/app': '/shelf/type/webgl/',
    '/ru/type/component': '/shelf/ru/type/control/',
    '/ru/type/motion': '/shelf/ru/type/gallery/',
    '/ru/type/app': '/shelf/ru/type/webgl/'
  },
  devToolbar: { enabled: false }
});

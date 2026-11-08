import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const rawBase = process.env.BASE_PATH ?? '/';
const base = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`;
function readSiteUrl() {
  const value = process.env.SITE_URL?.trim();
  if (!value) return undefined;
  try {
    new URL(value);
    return value;
  } catch {
    return undefined;
  }
}

const site = readSiteUrl();

export default defineConfig({
  output: 'static',
  site,
  base,
  trailingSlash: 'always',
  integrations: [react()],
  // The immersive HUD occupies the bottom of the viewport; the dev toolbar
  // overlaps its controls and intercepts pointer events in end-to-end tests.
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});

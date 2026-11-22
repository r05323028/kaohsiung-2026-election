import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { likenessPreview } from './scripts/dev/likeness-preview.ts';

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
    // `likenessPreview` is inert unless a dev server starts with
    // LIKENESS_PREVIEW=1; it serves unapproved head kits from data/ so they can
    // be inspected in the city without weakening the human approval gate.
    plugins: [tailwindcss(), likenessPreview()],
  },
});

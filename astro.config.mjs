// @ts-check
import { defineConfig } from 'astro/config';

// Static output. Astro pre-renders every page at build time into ./dist,
// which Cloudflare Workers serves directly as static assets (no adapter needed).
export default defineConfig({
  site: 'https://billwang.dev',
  output: 'static',
});

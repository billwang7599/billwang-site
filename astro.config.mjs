// @ts-check
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { devBlogPlugin, stripDevBlogIntegration } from './src/dev-blog/plugin.ts';

// Static output. Astro pre-renders every page at build time into ./dist,
// which Cloudflare Workers serves directly as static assets (no adapter needed).
export default defineConfig({
  site: 'https://billwang.dev',
  output: 'static',
  integrations: [stripDevBlogIntegration()],
  vite: {
    plugins: [devBlogPlugin()],
  },
  // The old combined /works section split into /projects and /writing. Keep the
  // old URLs alive: posts used to live at /works/[slug] and are now writing.
  redirects: {
    '/works': '/projects',
    '/works/[slug]': '/writing/[slug]',
  },
  markdown: {
    // remark-math parses $…$ / $$…$$; rehype-katex typesets it to HTML at build
    // time. The KaTeX stylesheet is loaded in src/layouts/Post.astro.
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});

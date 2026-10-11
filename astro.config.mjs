// @ts-check
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { devBlogPlugin } from './src/dev-blog/plugin.ts';

// Static output. Astro pre-renders every page at build time into ./dist,
// which Cloudflare Workers serves directly as static assets (no adapter needed).
export default defineConfig({
  site: 'https://billwang.dev',
  output: 'static',
  vite: {
    plugins: [devBlogPlugin()],
  },
  // Old URLs stay alive: /works and /writing were earlier homes of the blog, and
  // /projects was folded into it.
  redirects: {
    '/works': '/blog',
    '/works/[slug]': '/blog/[slug]',
    '/writing': '/blog',
    '/writing/[slug]': '/blog/[slug]',
    '/projects': '/blog',
  },
  markdown: {
    // remark-math parses $…$ / $$…$$; rehype-katex typesets it to HTML at build
    // time. The KaTeX stylesheet is loaded in src/layouts/Post.astro.
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});

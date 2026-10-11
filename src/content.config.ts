import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Posts are plain Markdown files in src/content/blog/. The glob loader picks
// them up at build time; the schema below type-checks every post's frontmatter,
// so a missing or mistyped field fails the build instead of rendering wrong.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };

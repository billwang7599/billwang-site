import { defineCollection, reference, z } from 'astro:content';
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
    // Optionally tie a post to a project (by its filename slug, e.g.
    // `project: golang-pong`). The build fails if that project doesn't exist,
    // so the link is always valid. Drives the "part of" link on the post and
    // the auto writing list on the project page.
    project: reference('projects').optional(),
  }),
});

// Projects are Markdown case studies in src/content/projects/. Same git-backed
// flow as posts — drop a file in, it appears on /projects with its own page.
// The body (everything under the frontmatter) is the write-up; the fields below
// drive the index row, the case-study header, and ordering.
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    year: z.string(),
    // Higher `order` floats to the top of the list; ties break by year, newest
    // first. `featured` pins a project above the rest regardless of order.
    order: z.number().default(0),
    featured: z.boolean().default(false),
    tech: z.array(z.string()).default([]),
    // Optional outbound links rendered as actions in the case-study header.
    link: z.string().optional(),   // live / demo URL (or an internal path)
    repo: z.string().url().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, projects };

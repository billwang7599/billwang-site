// Request-body → frontmatter helpers shared by the dev-server plugin (writes
// files) and the production Worker (commits to GitHub). Pure functions only, so
// both runtimes can import this file.
import type { PostFrontmatter } from './frontmatter';

export type JsonBody = Record<string, unknown>;

/** Image mime → file extension. Only these are accepted for upload. */
export const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

export const MAX_UPLOAD = 12 * 1024 * 1024; // 12MB

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Ids become filenames, so only plain slugs get through. */
export function safeId(id: string): string {
  if (!/^[a-z0-9-]+$/i.test(id)) {
    throw new Error('Invalid id');
  }
  return id;
}

export function parseTags(body: JsonBody): string[] {
  if (Array.isArray(body.tags)) return body.tags as string[];
  return String(body.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function postFrontmatterFromBody(body: JsonBody): PostFrontmatter {
  return {
    title: String(body.title ?? ''),
    description: String(body.description ?? ''),
    pubDate: String(body.pubDate ?? ''),
    updatedDate: body.updatedDate ? String(body.updatedDate) : undefined,
    tags: parseTags(body),
    draft: Boolean(body.draft),
  };
}

export function fallbackPostFrontmatter(id: string): PostFrontmatter {
  return {
    title: id,
    description: '',
    pubDate: '1970-01-01',
    tags: [],
    draft: false,
  };
}

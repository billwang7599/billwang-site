// The blog is served from its own host in production (blog.billwang.dev, with
// the posts at the root), while the same build also lives under /blog/ on the
// dev server and the apex host. Every link into or out of the blog goes through
// here so the two layouts can't drift.
export const SITE_ORIGIN = 'https://billwang.dev';
export const BLOG_ORIGIN = 'https://blog.billwang.dev';

/** Blog index (no id) or a single post, as a root-relative href. */
export function blogPath(id?: string): string {
  const base = import.meta.env.PROD ? '' : '/blog';
  return id ? `${base}/${id}` : `${base}/`;
}

/** The landing card. Cross-host in production, so it must be absolute there. */
export const HOME_HREF = import.meta.env.PROD ? `${SITE_ORIGIN}/` : '/';

/** The blog from the landing card, which lives on the apex host. */
export const BLOG_HREF = import.meta.env.PROD ? `${BLOG_ORIGIN}/` : '/blog/';

/** Canonical URLs always name the production location. */
export const canonicalPost = (id: string) => `${BLOG_ORIGIN}/${id}`;
export const CANONICAL_INDEX = `${BLOG_ORIGIN}/`;

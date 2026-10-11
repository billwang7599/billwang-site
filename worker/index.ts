// Front door for billwang.dev and blog.billwang.dev. Static assets are served
// by the platform; this Worker runs first (run_worker_first) to:
//   1. gate /edit/* behind Cloudflare Access (anything else → empty 404),
//   2. serve the editor API from the EditorDO,
//   3. map blog.billwang.dev/<slug> onto the build's /blog/<slug>/ pages and
//      redirect the old URLs (apex /blog, /writing, /works, /projects).
import { isSignedIn } from './access';
import type { Result } from './editor-do';
import type { JsonBody } from '../src/dev-blog/post-input';

export { EditorDO } from './editor-do';

const BLOG_HOST = 'blog.billwang.dev';

/** Old URL prefixes that now live at the root of the blog host. */
const LEGACY_PREFIXES = ['/blog', '/writing', '/works'];

/** Where an old-style path now lives on the blog host, or null if it isn't one. */
function legacyBlogPath(pathname: string): string | null {
  for (const prefix of LEGACY_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length) || '/';
    }
  }
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return '/';
  return null;
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const editor = env.EDITOR.getByName('editor');
  const { method } = request;
  const json = async () => ((await request.json().catch(() => ({}))) as JsonBody);

  let result: Result;
  try {
    const post = pathname.match(/^\/edit\/api\/posts\/([^/]+)$/);
    if (pathname === '/edit/api/uploads' && method === 'POST') {
      result = await editor.uploadImage(
        await request.arrayBuffer(),
        request.headers.get('content-type') ?? '',
      );
    } else if (pathname === '/edit/api/posts' && method === 'GET') {
      result = await editor.listPosts();
    } else if (pathname === '/edit/api/posts' && method === 'POST') {
      result = await editor.createPost(await json());
    } else if (post && method === 'GET') {
      result = await editor.getPost(decodeURIComponent(post[1]));
    } else if (post && method === 'PUT') {
      result = await editor.savePost(decodeURIComponent(post[1]), await json());
    } else if (post && method === 'DELETE') {
      result = await editor.deletePost(decodeURIComponent(post[1]));
    } else {
      result = { status: 404, data: { error: 'Not found' } };
    }
  } catch (err) {
    result = { status: 500, data: { error: err instanceof Error ? err.message : 'Server error' } };
  }

  return Response.json(result.data, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** blog.billwang.dev/<slug> → the build's /blog/<slug>/ page. */
function serveBlog(request: Request, env: Env, url: URL): Promise<Response> | Response {
  const legacy = legacyBlogPath(url.pathname);
  if (legacy !== null) return Response.redirect(new URL(legacy + url.search, url), 301);

  const last = url.pathname.split('/').pop() ?? '';
  // Built files (/_astro/*, /rss.xml, images…) are served from where they are.
  if (url.pathname.startsWith('/_astro/') || last.includes('.')) return env.ASSETS.fetch(request);

  // Rewrite straight to the trailing-slash form so assets doesn't redirect and
  // leak the internal /blog/ prefix into the address bar.
  const slug = url.pathname.replace(/\/+$/, '');
  const target = new URL(`/blog${slug}/`, url);
  return env.ASSETS.fetch(new Request(target, request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/edit' || url.pathname.startsWith('/edit/')) {
      if (!(await isSignedIn(request, env))) return notFound();
      if (url.pathname.startsWith('/edit/api/')) return handleApi(request, env, url.pathname);
      return env.ASSETS.fetch(request);
    }

    if (url.hostname === BLOG_HOST) return serveBlog(request, env, url);

    const legacy = legacyBlogPath(url.pathname);
    if (legacy !== null) {
      return Response.redirect(`https://${BLOG_HOST}${legacy}${url.search}`, 301);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

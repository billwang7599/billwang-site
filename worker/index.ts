// Front door for billwang.dev and blog.billwang.dev. Static assets are served
// by the platform; this Worker runs first (run_worker_first) to:
//   1. serve the editor at billwang.dev/blog/edit and blog.billwang.dev/edit,
//      both backed by the build's /edit/ page and the GitHub-backed API,
//   2. send the rest of blog.billwang.dev to billwang.dev/blog.
//
// There is NO authentication in this file. Cloudflare Access in front of those
// two paths is the only gate, so the Worker must answer the editor on exactly
// the paths Access covers and nowhere else (see editorPath, and the workers.dev
// / preview URLs being switched off in wrangler.json).
import * as editor from './editor';
import type { Result } from './editor';
import type { JsonBody } from '../src/dev-blog/post-input';

const BLOG_HOST = 'blog.billwang.dev';
const SITE_ORIGIN = 'https://billwang.dev';

/** The editor's path as the build knows it (/edit/...), or null if this request
 *  isn't for the editor. Each host answers only on its own Access-protected
 *  path: /edit on the blog host, /blog/edit on the apex. */
function editorPath(url: URL): string | null {
  const prefix = url.hostname === BLOG_HOST ? '' : '/blog';
  const base = `${prefix}/edit`;
  const { pathname } = url;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  return pathname.slice(prefix.length);
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/** Writes must come from the editor's own origin. Browsers always attach Origin
 *  to cross-site writes, so this stops another site from driving the API with a
 *  signed-in visitor's cookies. Requests with no Origin (curl, same-origin GETs)
 *  pass; Access is still the real gate. */
function crossOriginWrite(request: Request, url: URL): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return false;
  const origin = request.headers.get('Origin');
  return origin !== null && origin !== url.origin;
}

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const { method } = request;
  const json = async () => ((await request.json().catch(() => ({}))) as JsonBody);

  let result: Result;
  try {
    const post = pathname.match(/^\/edit\/api\/posts\/([^/]+)$/);
    if (pathname === '/edit/api/uploads' && method === 'POST') {
      result = await editor.uploadImage(
        env,
        await request.arrayBuffer(),
        request.headers.get('content-type') ?? '',
      );
    } else if (pathname === '/edit/api/posts' && method === 'GET') {
      result = await editor.listPosts(env);
    } else if (pathname === '/edit/api/posts' && method === 'POST') {
      result = await editor.createPost(env, await json());
    } else if (post && method === 'GET') {
      result = await editor.getPost(env, decodeURIComponent(post[1]));
    } else if (post && method === 'PUT') {
      result = await editor.savePost(env, decodeURIComponent(post[1]), await json());
    } else if (post && method === 'DELETE') {
      result = await editor.deletePost(env, decodeURIComponent(post[1]));
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

/** blog.billwang.dev/<anything> → billwang.dev/blog/<anything>. */
function redirectToBlog(url: URL): Response {
  const rest = url.pathname.replace(/^\/blog(?=\/|$)/, '') || '/';
  // Built files (/rss.xml, images…) live at the apex root, not under /blog.
  const isFile = (rest.split('/').pop() ?? '').includes('.');
  const target = isFile ? rest : `/blog${rest}`;
  return Response.redirect(`${SITE_ORIGIN}${target}${url.search}`, 301);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const route = editorPath(url);
    if (route !== null) {
      if (route.startsWith('/edit/api/')) {
        if (crossOriginWrite(request, url)) {
          return Response.json({ error: 'Cross-origin request blocked' }, { status: 403 });
        }
        return handleApi(request, env, route);
      }
      // The page is built at /edit/; request that form so assets doesn't
      // redirect and expose the internal path.
      const asset = new URL(route === '/edit' ? '/edit/' : route, url);
      return env.ASSETS.fetch(new Request(asset, request));
    }

    // The built editor page is in the assets; never serve it from a path
    // Access doesn't cover.
    if (url.pathname === '/edit' || url.pathname.startsWith('/edit/')) return notFound();

    if (url.hostname === BLOG_HOST) return redirectToBlog(url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

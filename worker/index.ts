// Front door for billwang.dev and blog.billwang.dev. Static assets are served
// by the platform; this Worker runs first (run_worker_first) to:
//   1. serve the editor at billwang.dev/blog/edit and blog.billwang.dev/edit,
//      both backed by the build's /edit/ page and the GitHub-backed API,
//   2. serve the blog at blog.billwang.dev (the build's /blog pages, with the
//      address left alone), and send billwang.dev/blog/... there.
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

const BLOG_PREFIX = /^\/blog(?=\/|$)/;

/** Built files (/rss.xml, /_astro/*.js, images…) live at the build root, not
 *  under /blog, so both hosts serve them as-is. */
function isFile(pathname: string): boolean {
  return (pathname.split('/').pop() ?? '').includes('.');
}

/** billwang.dev/blog/<anything> → blog.billwang.dev/<anything>. */
function redirectToBlogHost(url: URL): Response {
  const rest = url.pathname.replace(BLOG_PREFIX, '') || '/';
  return Response.redirect(`https://${BLOG_HOST}${rest}${url.search}`, 301);
}

/** blog.billwang.dev/<page> is served from the build's /blog/<page>/ without
 *  changing the address. The build's links still say /blog/..., so they're
 *  rewritten on the way out; "/" means the card, which lives on the apex. */
async function serveBlogPage(request: Request, env: Env, url: URL): Promise<Response> {
  // Ask for the trailing-slash form so assets doesn't answer with a redirect
  // to its internal /blog/ path.
  const page = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const res = await env.ASSETS.fetch(new Request(new URL(`/blog${page}`, url), request));

  return new HTMLRewriter()
    .on('a[href]', {
      element(el) {
        const href = el.getAttribute('href')!;
        if (href === '/') el.setAttribute('href', `${SITE_ORIGIN}/`);
        else if (BLOG_PREFIX.test(href)) el.setAttribute('href', href.replace(BLOG_PREFIX, '') || '/');
      },
    })
    .transform(res);
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

    if (url.hostname === BLOG_HOST) {
      if (isFile(url.pathname)) return env.ASSETS.fetch(request);
      // Old-style blog.billwang.dev/blog/... links drop the redundant prefix.
      if (BLOG_PREFIX.test(url.pathname)) return redirectToBlogHost(url);
      return serveBlogPage(request, env, url);
    }
    if (BLOG_PREFIX.test(url.pathname)) return redirectToBlogHost(url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

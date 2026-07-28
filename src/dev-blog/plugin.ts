import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  parsePost,
  parseProject,
  serializePost,
  serializeProject,
  type PostFrontmatter,
  type ProjectFrontmatter,
} from './frontmatter';

const BLOG_DIR = path.resolve('src/content/blog');
const PROJECTS_DIR = path.resolve('src/content/projects');
const API = '/edit/api';
/** Legacy prefix — kept so a stale dev server still works until restart. */
const API_PREFIXES = [API, '/blog/api'] as const;

type JsonBody = Record<string, unknown>;

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JsonBody;
  } catch {
    throw new Error('Invalid JSON body');
  }
}

/** Collect the request body as raw bytes — readBody() coerces to utf8 and would
 *  corrupt binary, so image uploads need their own reader. */
function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Image mime → file extension. Only these are accepted for upload. */
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

const MAX_UPLOAD = 12 * 1024 * 1024; // 12MB

/** Save a pasted/dropped image beside the collection's Markdown with a random
 *  uuid filename, so the post can reference it as ./<uuid>.<ext> regardless of
 *  its own (possibly not-yet-chosen) filename. */
async function handleUpload(req: IncomingMessage, res: ServerResponse) {
  const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
  const dir = query.get('collection') === 'projects' ? PROJECTS_DIR : BLOG_DIR;

  const type = String(req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const ext = IMAGE_EXT[type];
  if (!ext) {
    return sendJson(res, 415, { error: `Unsupported image type: ${type || 'unknown'}` });
  }

  const buf = await readRawBody(req);
  if (buf.length === 0) return sendJson(res, 400, { error: 'Empty upload' });
  if (buf.length > MAX_UPLOAD) {
    return sendJson(res, 413, { error: 'Image too large (max 12MB)' });
  }

  await fs.mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, name), buf);
  return sendJson(res, 201, { path: `./${name}`, name });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeId(id: string): string {
  const safe = path.basename(id);
  if (!/^[a-z0-9-]+$/i.test(safe)) {
    throw new Error('Invalid id');
  }
  return safe;
}

function postPath(id: string): string {
  return path.join(BLOG_DIR, `${safeId(id)}.md`);
}

function projectPath(id: string): string {
  return path.join(PROJECTS_DIR, `${safeId(id)}.md`);
}

function parseTags(body: JsonBody): string[] {
  if (Array.isArray(body.tags)) return body.tags as string[];
  return String(body.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseTech(body: JsonBody): string[] {
  if (Array.isArray(body.tech)) return body.tech as string[];
  return String(body.tech ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function postFrontmatterFromBody(body: JsonBody): PostFrontmatter {
  return {
    title: String(body.title ?? ''),
    description: String(body.description ?? ''),
    pubDate: String(body.pubDate ?? ''),
    updatedDate: body.updatedDate ? String(body.updatedDate) : undefined,
    tags: parseTags(body),
    draft: Boolean(body.draft),
    project: body.project ? String(body.project) : undefined,
  };
}

function projectFrontmatterFromBody(body: JsonBody): ProjectFrontmatter {
  return {
    title: String(body.title ?? ''),
    description: String(body.description ?? ''),
    year: String(body.year ?? new Date().getFullYear()),
    order: Number(body.order) || 0,
    featured: Boolean(body.featured),
    tech: parseTech(body),
    link: body.link ? String(body.link) : undefined,
    repo: body.repo ? String(body.repo) : undefined,
    draft: Boolean(body.draft),
  };
}

function fallbackPostFrontmatter(id: string): PostFrontmatter {
  return {
    title: id,
    description: '',
    pubDate: '1970-01-01',
    tags: [],
    draft: false,
  };
}

function fallbackProjectFrontmatter(id: string): ProjectFrontmatter {
  return {
    title: id,
    description: '',
    year: String(new Date().getFullYear()),
    order: 0,
    featured: false,
    tech: [],
    draft: false,
  };
}

async function listPosts() {
  let files: string[];
  try {
    files = await fs.readdir(BLOG_DIR);
  } catch {
    return [];
  }

  const posts = [];

  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const id = file.replace(/\.md$/, '');
    try {
      const raw = await fs.readFile(path.join(BLOG_DIR, file), 'utf8');
      const { frontmatter } = parsePost(id, raw);
      posts.push({ id, frontmatter, broken: false });
    } catch (err) {
      console.warn(`[dev-blog] skipping post ${file}:`, err);
      posts.push({ id, frontmatter: fallbackPostFrontmatter(id), broken: true });
    }
  }

  posts.sort((a, b) => {
    const aTime = Date.parse(a.frontmatter.pubDate) || 0;
    const bTime = Date.parse(b.frontmatter.pubDate) || 0;
    return bTime - aTime;
  });

  return posts;
}

async function listProjects() {
  let files: string[];
  try {
    files = await fs.readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  const projects = [];

  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const id = file.replace(/\.md$/, '');
    try {
      const raw = await fs.readFile(path.join(PROJECTS_DIR, file), 'utf8');
      const { frontmatter } = parseProject(id, raw);
      projects.push({ id, frontmatter, broken: false });
    } catch (err) {
      console.warn(`[dev-blog] skipping project ${file}:`, err);
      projects.push({ id, frontmatter: fallbackProjectFrontmatter(id), broken: true });
    }
  }

  projects.sort((a, b) => {
    if (b.frontmatter.order !== a.frontmatter.order) {
      return b.frontmatter.order - a.frontmatter.order;
    }
    return (a.frontmatter.title || a.id).localeCompare(b.frontmatter.title || b.id);
  });

  return projects;
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  try {
    if (pathname === `${API}/uploads` && req.method === 'POST') {
      return await handleUpload(req, res);
    }

    if (pathname === `${API}/posts` && req.method === 'GET') {
      return sendJson(res, 200, await listPosts());
    }

    if (pathname === `${API}/projects` && req.method === 'GET') {
      return sendJson(res, 200, await listProjects());
    }

    const postMatch = pathname.match(new RegExp(`^${API}/posts/([^/]+)$`));
    if (postMatch) {
      const id = decodeURIComponent(postMatch[1]);

      if (req.method === 'GET') {
        try {
          const raw = await fs.readFile(postPath(id), 'utf8');
          return sendJson(res, 200, { ...parsePost(id, raw), broken: false });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Parse error';
          return sendJson(res, 200, {
            id,
            frontmatter: fallbackPostFrontmatter(id),
            body: '',
            broken: true,
            error: message,
          });
        }
      }

      if (req.method === 'PUT') {
        const body = await readJson(req);
        const frontmatter = postFrontmatterFromBody(body);
        const content = serializePost(frontmatter, String(body.body ?? ''));
        await fs.writeFile(postPath(id), content, 'utf8');
        return sendJson(res, 200, { id, ok: true });
      }

      if (req.method === 'DELETE') {
        await fs.unlink(postPath(id));
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === `${API}/posts` && req.method === 'POST') {
      const body = await readJson(req);
      const frontmatter = postFrontmatterFromBody(body);
      const slug = slugify(frontmatter.title);
      if (!frontmatter.pubDate || !slug) {
        return sendJson(res, 400, { error: 'Title and pub date are required' });
      }

      const id = `${frontmatter.pubDate}-${slug}`;
      const file = postPath(id);

      try {
        await fs.access(file);
        return sendJson(res, 409, { error: 'A post with that filename already exists' });
      } catch {
        // new file
      }

      const content = serializePost(frontmatter, String(body.body ?? ''));
      await fs.writeFile(file, content, 'utf8');
      return sendJson(res, 201, { id, ok: true });
    }

    const projectMatch = pathname.match(new RegExp(`^${API}/projects/([^/]+)$`));
    if (projectMatch) {
      const id = decodeURIComponent(projectMatch[1]);

      if (req.method === 'GET') {
        try {
          const raw = await fs.readFile(projectPath(id), 'utf8');
          return sendJson(res, 200, { ...parseProject(id, raw), broken: false });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Parse error';
          return sendJson(res, 200, {
            id,
            frontmatter: fallbackProjectFrontmatter(id),
            body: '',
            broken: true,
            error: message,
          });
        }
      }

      if (req.method === 'PUT') {
        const body = await readJson(req);
        const frontmatter = projectFrontmatterFromBody(body);
        const content = serializeProject(frontmatter, String(body.body ?? ''));
        await fs.writeFile(projectPath(id), content, 'utf8');
        return sendJson(res, 200, { id, ok: true });
      }

      if (req.method === 'DELETE') {
        await fs.unlink(projectPath(id));
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === `${API}/projects` && req.method === 'POST') {
      const body = await readJson(req);
      const frontmatter = projectFrontmatterFromBody(body);
      const id = slugify(frontmatter.title);
      if (!id) {
        return sendJson(res, 400, { error: 'Title is required' });
      }

      const file = projectPath(id);

      try {
        await fs.access(file);
        return sendJson(res, 409, { error: 'A project with that filename already exists' });
      } catch {
        // new file
      }

      const content = serializeProject(frontmatter, String(body.body ?? ''));
      await fs.writeFile(file, content, 'utf8');
      return sendJson(res, 201, { id, ok: true });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    sendJson(res, 500, { error: message });
  }
}

/** Vite dev-server middleware — reads/writes content on localhost only. */
export function devBlogPlugin(): Plugin {
  return {
    name: 'dev-blog',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const pathname = url.split('?')[0];
        const prefix = API_PREFIXES.find((p) => pathname.startsWith(p));
        if (!prefix) return next();
        const apiPath = API + pathname.slice(prefix.length);
        await handleApi(req, res, apiPath);
      });
    },
  };
}

/** Strip /edit from the production static output after build. */
export function stripDevBlogIntegration() {
  return {
    name: 'strip-dev-edit',
    hooks: {
      'astro:build:done': async ({ dir }: { dir: URL }) => {
        const editDir = new URL('edit/', dir);
        await fs.rm(editDir, { recursive: true, force: true });
      },
    },
  };
}

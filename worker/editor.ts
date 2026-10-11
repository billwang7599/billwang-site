// The editor's operations on the content repo. Every save is a commit on the
// content branch through the GitHub contents API; Workers Builds then rebuilds
// and deploys the site. Each function answers with an HTTP-shaped result.
import { parsePost, serializePost, type PostFrontmatter } from '../src/dev-blog/frontmatter';
import {
  IMAGE_EXT,
  MAX_UPLOAD,
  fallbackPostFrontmatter,
  postFrontmatterFromBody,
  safeId,
  slugify,
  type JsonBody,
} from '../src/dev-blog/post-input';
import { GitHub, GitHubError } from './github';

const DIR = 'src/content/blog';

export interface Result {
  status: number;
  data: unknown;
}

const ok = (data: unknown, status = 200): Result => ({ status, data });
const fail = (status: number, error: string): Result => ({ status, data: { error } });

const github = (env: Env) => new GitHub(env.GITHUB_TOKEN, env.GITHUB_REPO, env.GITHUB_BRANCH);

/** GitHub answers 409 when the branch moved between our read and our write,
 *  e.g. two images pasted in quick succession. Re-run the whole read-then-write
 *  a few times with a little jitter so the commits take turns. */
async function withRetry(fn: () => Promise<Result>): Promise<Result> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GitHubError && err.status === 409 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1) + Math.random() * 250));
        continue;
      }
      throw err;
    }
  }
}

async function guard(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GitHubError) return fail(err.status === 409 ? 409 : 502, err.message);
    return fail(500, err instanceof Error ? err.message : 'Server error');
  }
}

export function listPosts(env: Env): Promise<Result> {
  return guard(async () => {
    const gh = github(env);
    const files = (await gh.list(DIR)).filter((f) => f.type === 'file' && f.name.endsWith('.md'));

    const posts = await Promise.all(
      files.map(async (f) => {
        const id = f.name.replace(/\.md$/, '');
        try {
          const file = await gh.read(`${DIR}/${f.name}`);
          const frontmatter: PostFrontmatter = parsePost(id, file?.text ?? '').frontmatter;
          return { id, frontmatter, broken: false };
        } catch {
          return { id, frontmatter: fallbackPostFrontmatter(id), broken: true };
        }
      }),
    );

    posts.sort(
      (a, b) => (Date.parse(b.frontmatter.pubDate) || 0) - (Date.parse(a.frontmatter.pubDate) || 0),
    );
    return ok(posts);
  });
}

export function getPost(env: Env, rawId: string): Promise<Result> {
  return guard(async () => {
    const id = safeId(rawId);
    const file = await github(env).read(`${DIR}/${id}.md`);
    if (!file) return fail(404, 'Post not found');
    try {
      return ok({ ...parsePost(id, file.text), broken: false });
    } catch (err) {
      return ok({
        id,
        frontmatter: fallbackPostFrontmatter(id),
        body: '',
        broken: true,
        error: err instanceof Error ? err.message : 'Parse error',
      });
    }
  });
}

export function savePost(env: Env, rawId: string, body: JsonBody): Promise<Result> {
  return guard(() =>
    withRetry(async () => {
      const id = safeId(rawId);
      const path = `${DIR}/${id}.md`;
      const gh = github(env);
      const sha = await gh.sha(path);
      if (!sha) return fail(404, 'Post not found');
      const content = serializePost(postFrontmatterFromBody(body), String(body.body ?? ''));
      await gh.put(path, content, `edit: ${id}`, sha);
      return ok({ id, ok: true });
    }),
  );
}

export function createPost(env: Env, body: JsonBody): Promise<Result> {
  return guard(() =>
    withRetry(async () => {
      const frontmatter = postFrontmatterFromBody(body);
      const slug = slugify(frontmatter.title);
      if (!frontmatter.pubDate || !slug) return fail(400, 'Title and pub date are required');

      const id = `${frontmatter.pubDate}-${slug}`;
      const path = `${DIR}/${safeId(id)}.md`;
      const gh = github(env);
      if (await gh.sha(path)) return fail(409, 'A post with that filename already exists');

      await gh.put(path, serializePost(frontmatter, String(body.body ?? '')), `new: ${id}`);
      return ok({ id, ok: true }, 201);
    }),
  );
}

export function deletePost(env: Env, rawId: string): Promise<Result> {
  return guard(() =>
    withRetry(async () => {
      const id = safeId(rawId);
      const path = `${DIR}/${id}.md`;
      const gh = github(env);
      const sha = await gh.sha(path);
      if (!sha) return fail(404, 'Post not found');
      await gh.remove(path, sha, `delete: ${id}`);
      return ok({ ok: true });
    }),
  );
}

/** Commit a pasted/dropped image beside the posts under a uuid name, so a post
 *  can reference it as ./<uuid>.<ext> before it has a filename of its own. */
export function uploadImage(env: Env, bytes: ArrayBuffer, contentType: string): Promise<Result> {
  return guard(() =>
    withRetry(async () => {
      const type = contentType.split(';')[0].trim().toLowerCase();
      const ext = IMAGE_EXT[type];
      if (!ext) return fail(415, `Unsupported image type: ${type || 'unknown'}`);
      if (bytes.byteLength === 0) return fail(400, 'Empty upload');
      if (bytes.byteLength > MAX_UPLOAD) return fail(413, 'Image too large (max 12MB)');

      const name = `${crypto.randomUUID()}.${ext}`;
      await github(env).put(`${DIR}/${name}`, new Uint8Array(bytes), `image: ${name}`);
      return ok({ path: `./${name}`, name }, 201);
    }),
  );
}

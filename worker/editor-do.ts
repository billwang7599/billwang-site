// One Durable Object owns every write to the content repo. Its two jobs:
//  1. Serialise commits. Awaiting a fetch() does not hold off other requests to
//     a DO, so two quick saves could race the GitHub contents API (409 on a
//     stale sha). `serial()` queues them.
//  2. Cache parsed frontmatter by blob sha, so listing the posts costs one
//     GitHub call instead of one per file.
import { DurableObject } from 'cloudflare:workers';
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

/** Every method answers with an HTTP-shaped result; errors thrown across RPC
 *  lose their class, so the status travels in the value instead. */
export interface Result {
  status: number;
  data: unknown;
}

const ok = (data: unknown, status = 200): Result => ({ status, data });
const fail = (status: number, error: string): Result => ({ status, data: { error } });

export class EditorDO extends DurableObject<Env> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS post_cache (
          id TEXT PRIMARY KEY,
          sha TEXT NOT NULL,
          frontmatter TEXT NOT NULL,
          broken INTEGER NOT NULL
        )
      `);
    });
  }

  private gh(): GitHub {
    return new GitHub(this.env.GITHUB_TOKEN, this.env.GITHUB_REPO, this.env.GITHUB_BRANCH);
  }

  /** Run `fn` after every earlier call has settled, whether it passed or not. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private async guard(fn: () => Promise<Result>): Promise<Result> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GitHubError) return fail(err.status === 409 ? 409 : 502, err.message);
      return fail(500, err instanceof Error ? err.message : 'Server error');
    }
  }

  async listPosts(): Promise<Result> {
    return this.guard(async () => {
      const gh = this.gh();
      const files = (await gh.list(DIR)).filter((f) => f.type === 'file' && f.name.endsWith('.md'));
      const cached = new Map(
        this.ctx.storage.sql
          .exec<{ id: string; sha: string; frontmatter: string; broken: number }>(
            'SELECT id, sha, frontmatter, broken FROM post_cache',
          )
          .toArray()
          .map((r) => [r.id, r]),
      );

      const posts = await Promise.all(
        files.map(async (f) => {
          const id = f.name.replace(/\.md$/, '');
          const hit = cached.get(id);
          if (hit && hit.sha === f.sha) {
            return {
              id,
              frontmatter: JSON.parse(hit.frontmatter) as PostFrontmatter,
              broken: Boolean(hit.broken),
            };
          }
          let frontmatter: PostFrontmatter;
          let broken = false;
          try {
            const file = await gh.read(`${DIR}/${f.name}`);
            frontmatter = parsePost(id, file?.text ?? '').frontmatter;
          } catch {
            frontmatter = fallbackPostFrontmatter(id);
            broken = true;
          }
          this.ctx.storage.sql.exec(
            'INSERT OR REPLACE INTO post_cache (id, sha, frontmatter, broken) VALUES (?, ?, ?, ?)',
            id,
            f.sha,
            JSON.stringify(frontmatter),
            broken ? 1 : 0,
          );
          return { id, frontmatter, broken };
        }),
      );

      // Drop cache rows for posts that no longer exist.
      const live = new Set(posts.map((p) => p.id));
      for (const id of cached.keys()) {
        if (!live.has(id)) this.ctx.storage.sql.exec('DELETE FROM post_cache WHERE id = ?', id);
      }

      posts.sort((a, b) => (Date.parse(b.frontmatter.pubDate) || 0) - (Date.parse(a.frontmatter.pubDate) || 0));
      return ok(posts);
    });
  }

  async getPost(rawId: string): Promise<Result> {
    return this.guard(async () => {
      const id = safeId(rawId);
      const file = await this.gh().read(`${DIR}/${id}.md`);
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

  savePost(rawId: string, body: JsonBody): Promise<Result> {
    return this.serial(() =>
      this.guard(async () => {
        const id = safeId(rawId);
        const path = `${DIR}/${id}.md`;
        const gh = this.gh();
        const sha = await gh.sha(path);
        if (!sha) return fail(404, 'Post not found');
        const content = serializePost(postFrontmatterFromBody(body), String(body.body ?? ''));
        await gh.put(path, content, `edit: ${id}`, sha);
        return ok({ id, ok: true });
      }),
    );
  }

  createPost(body: JsonBody): Promise<Result> {
    return this.serial(() =>
      this.guard(async () => {
        const frontmatter = postFrontmatterFromBody(body);
        const slug = slugify(frontmatter.title);
        if (!frontmatter.pubDate || !slug) return fail(400, 'Title and pub date are required');

        const id = `${frontmatter.pubDate}-${slug}`;
        const path = `${DIR}/${safeId(id)}.md`;
        const gh = this.gh();
        if (await gh.sha(path)) return fail(409, 'A post with that filename already exists');

        await gh.put(path, serializePost(frontmatter, String(body.body ?? '')), `new: ${id}`);
        return ok({ id, ok: true }, 201);
      }),
    );
  }

  deletePost(rawId: string): Promise<Result> {
    return this.serial(() =>
      this.guard(async () => {
        const id = safeId(rawId);
        const path = `${DIR}/${id}.md`;
        const gh = this.gh();
        const sha = await gh.sha(path);
        if (!sha) return fail(404, 'Post not found');
        await gh.remove(path, sha, `delete: ${id}`);
        this.ctx.storage.sql.exec('DELETE FROM post_cache WHERE id = ?', id);
        return ok({ ok: true });
      }),
    );
  }

  /** Commit a pasted/dropped image beside the posts under a uuid name, so a post
   *  can reference it as ./<uuid>.<ext> before it has a filename of its own. */
  uploadImage(bytes: ArrayBuffer, contentType: string): Promise<Result> {
    return this.serial(() =>
      this.guard(async () => {
        const type = contentType.split(';')[0].trim().toLowerCase();
        const ext = IMAGE_EXT[type];
        if (!ext) return fail(415, `Unsupported image type: ${type || 'unknown'}`);
        if (bytes.byteLength === 0) return fail(400, 'Empty upload');
        if (bytes.byteLength > MAX_UPLOAD) return fail(413, 'Image too large (max 12MB)');

        const name = `${crypto.randomUUID()}.${ext}`;
        await this.gh().put(`${DIR}/${name}`, new Uint8Array(bytes), `image: ${name}`);
        return ok({ path: `./${name}`, name }, 201);
      }),
    );
  }
}

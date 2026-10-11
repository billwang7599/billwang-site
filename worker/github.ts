// Minimal GitHub contents-API client. Every save the editor makes is a commit
// on the content branch; Workers Builds then rebuilds and deploys the site.

export interface RepoFile {
  name: string;
  sha: string;
  type: string;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export class GitHub {
  constructor(
    private token: string,
    private repo: string,
    private branch: string,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'billwang-site-editor',
        ...init.headers,
      },
    });
  }

  private async json<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new GitHubError(res.status, `GitHub ${res.status}: ${detail.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /** Files in a directory, or [] if it doesn't exist. */
  async list(dir: string): Promise<RepoFile[]> {
    const res = await this.request(`/contents/${dir}?ref=${this.branch}`);
    if (res.status === 404) return [];
    return this.json<RepoFile[]>(res);
  }

  /** UTF-8 text content + blob sha, or null if the file doesn't exist. */
  async read(path: string): Promise<{ text: string; sha: string } | null> {
    const res = await this.request(`/contents/${path}?ref=${this.branch}`);
    if (res.status === 404) return null;
    const file = await this.json<{ content: string; sha: string }>(res);
    return { text: new TextDecoder().decode(fromBase64(file.content)), sha: file.sha };
  }

  async sha(path: string): Promise<string | null> {
    const res = await this.request(`/contents/${path}?ref=${this.branch}`);
    if (res.status === 404) return null;
    return (await this.json<{ sha: string }>(res)).sha;
  }

  /** Create or update. Pass the current sha to update, omit to create. */
  async put(path: string, content: string | Uint8Array, message: string, sha?: string) {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const res = await this.request(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(bytes), branch: this.branch, sha }),
    });
    return this.json<{ content: { sha: string } }>(res);
  }

  async remove(path: string, sha: string, message: string) {
    const res = await this.request(`/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: this.branch }),
    });
    await this.json(res);
  }
}

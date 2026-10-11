// Bindings and vars come from wrangler.json; secrets (set with
// `wrangler secret put`) aren't in the file, so they're declared here.
declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    GITHUB_REPO: string;
    GITHUB_BRANCH: string;
    /** Fine-grained PAT: Contents read/write on GITHUB_REPO only. */
    GITHUB_TOKEN: string;
  }
}
interface Env extends Cloudflare.Env {}

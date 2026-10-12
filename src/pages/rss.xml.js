import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// /rss.xml — subscribable feed of all non-draft posts, newest first. Items
// link to the blog's own host, where the posts live.
export async function GET() {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  return rss({
    title: 'Bill Wang — Blog',
    description: 'Posts by Bill Wang.',
    site: 'https://blog.billwang.dev',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: `/${post.id}/`,
    })),
  });
}

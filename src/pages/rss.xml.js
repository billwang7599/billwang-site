import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { canonicalPost } from '../lib/urls';

// /rss.xml — subscribable feed of all non-draft posts, newest first. item links are absolute
// URLs on the blog host.
export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  return rss({
    title: 'Bill Wang — Blog',
    description: 'Posts by Bill Wang.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: canonicalPost(post.id),
    })),
  });
}

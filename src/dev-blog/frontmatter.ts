export interface PostFrontmatter {
  title: string;
  description: string;
  pubDate: string;
  updatedDate?: string;
  tags: string[];
  draft: boolean;
}

export interface PostRecord {
  id: string;
  frontmatter: PostFrontmatter;
  body: string;
}

export function parseMarkdown(raw: string): PostRecord['frontmatter'] & { __body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter');
  return { ...parseFrontmatter(match[1]), __body: match[2] };
}

export function parsePost(id: string, raw: string): PostRecord {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter');
  return { id, frontmatter: parseFrontmatter(match[1]), body: match[2] };
}

function parseFrontmatter(yaml: string): PostFrontmatter {
  const fm: PostFrontmatter = {
    title: '',
    description: '',
    pubDate: '',
    tags: [],
    draft: false,
  };

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const quoted = trimmed.match(/^(\w+):\s*"(.*)"\s*$/);
    if (quoted) {
      setField(fm, quoted[1], quoted[2]);
      continue;
    }

    const plain = trimmed.match(/^(\w+):\s*(.+)\s*$/);
    if (plain) {
      setField(fm, plain[1], plain[2]);
    }
  }

  return fm;
}

function setField(fm: PostFrontmatter, key: string, value: string) {
  switch (key) {
    case 'title':
      fm.title = value;
      break;
    case 'description':
      fm.description = value;
      break;
    case 'pubDate':
    case 'updatedDate':
      fm[key] = value;
      break;
    case 'tags': {
      try {
        fm.tags = JSON.parse(value.replace(/'/g, '"')) as string[];
      } catch {
        fm.tags = [];
      }
      break;
    }
    case 'draft':
      fm.draft = value === 'true';
      break;
  }
}

export function serializePost(frontmatter: PostFrontmatter, body: string): string {
  const lines = [
    '---',
    `title: ${JSON.stringify(frontmatter.title)}`,
    `description: ${JSON.stringify(frontmatter.description)}`,
    `pubDate: ${frontmatter.pubDate}`,
  ];

  if (frontmatter.updatedDate) {
    lines.push(`updatedDate: ${frontmatter.updatedDate}`);
  }

  lines.push(`tags: ${JSON.stringify(frontmatter.tags)}`);

  if (frontmatter.draft) {
    lines.push('draft: true');
  }

  lines.push('---', '');

  const trimmed = body.replace(/^\n+/, '');
  return lines.join('\n') + trimmed;
}

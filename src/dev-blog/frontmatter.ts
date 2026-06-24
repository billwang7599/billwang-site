export interface PostFrontmatter {
  title: string;
  description: string;
  pubDate: string;
  updatedDate?: string;
  tags: string[];
  draft: boolean;
  project?: string;
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
    case 'project':
      fm.project = value;
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

  if (frontmatter.project) {
    lines.push(`project: ${frontmatter.project}`);
  }

  lines.push('---', '');

  const trimmed = body.replace(/^\n+/, '');
  return lines.join('\n') + trimmed;
}

export interface ProjectFrontmatter {
  title: string;
  description: string;
  year: string;
  order: number;
  featured: boolean;
  tech: string[];
  link?: string;
  repo?: string;
  draft: boolean;
}

export interface ProjectRecord {
  id: string;
  frontmatter: ProjectFrontmatter;
  body: string;
}

export function parseProject(id: string, raw: string): ProjectRecord {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter');
  return { id, frontmatter: parseProjectFrontmatter(match[1]), body: match[2] };
}

function parseProjectFrontmatter(yaml: string): ProjectFrontmatter {
  const fm: ProjectFrontmatter = {
    title: '',
    description: '',
    year: '',
    order: 0,
    featured: false,
    tech: [],
    draft: false,
  };

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const quoted = trimmed.match(/^(\w+):\s*"(.*)"\s*$/);
    if (quoted) {
      setProjectField(fm, quoted[1], quoted[2]);
      continue;
    }

    const plain = trimmed.match(/^(\w+):\s*(.+)\s*$/);
    if (plain) {
      setProjectField(fm, plain[1], plain[2]);
    }
  }

  return fm;
}

function setProjectField(fm: ProjectFrontmatter, key: string, value: string) {
  switch (key) {
    case 'title':
    case 'description':
    case 'year':
    case 'link':
    case 'repo':
      fm[key] = value;
      break;
    case 'order':
      fm.order = Number(value) || 0;
      break;
    case 'featured':
    case 'draft':
      fm[key] = value === 'true';
      break;
    case 'tech': {
      try {
        fm.tech = JSON.parse(value.replace(/'/g, '"')) as string[];
      } catch {
        fm.tech = [];
      }
      break;
    }
  }
}

export function serializeProject(frontmatter: ProjectFrontmatter, body: string): string {
  const lines = [
    '---',
    `title: ${JSON.stringify(frontmatter.title)}`,
    `description: ${JSON.stringify(frontmatter.description)}`,
    `year: ${JSON.stringify(frontmatter.year)}`,
    `order: ${frontmatter.order}`,
  ];

  if (frontmatter.featured) {
    lines.push('featured: true');
  }

  lines.push(`tech: ${JSON.stringify(frontmatter.tech)}`);

  if (frontmatter.link) {
    lines.push(
      frontmatter.link.startsWith('/')
        ? `link: ${frontmatter.link}`
        : `link: ${JSON.stringify(frontmatter.link)}`,
    );
  }

  if (frontmatter.repo) {
    lines.push(`repo: ${JSON.stringify(frontmatter.repo)}`);
  }

  if (frontmatter.draft) {
    lines.push('draft: true');
  }

  lines.push('---', '');

  const trimmed = body.replace(/^\n+/, '');
  return lines.join('\n') + trimmed;
}

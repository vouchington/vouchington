export const SYNCED_MODERATION_POLICY_MATRIX_DOC = [
  '## Policy Entries',
  '| Key | Label | Report Reason | AI Category | Surfaces | Severity | Appeal Eligible | Recommended Action (advisory) |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| spam | Spam | ✓ | ✓ | all | low | ✓ | remove |\n| harassment | Harassment | ✓ | ✓ | all | high | ✓ | remove |\n| misinformation | Misinformation | ✓ | ✓ | all | medium | ✓ | warn |\n| illegal_content | Illegal content | ✓ | ✓ | all | critical | ✓ | escalate |\n| hate_speech | Hate speech | — | ✓ | all | high | ✓ | remove |\n| sexual_content | Sexual content | — | ✓ | all | high | ✓ | remove |\n| violence | Violence | — | ✓ | all | critical | ✓ | escalate |\n| privacy_violation | Privacy violation | — | ✓ | all | high | ✓ | remove |\n| off_topic | Off topic | — | ✓ | all | low | ✓ | no_action |\n| vote_manipulation | Vote manipulation | ✓ | — | post | medium | ✓ | escalate |\n| other | Other | ✓ | — | all | low | ✓ | no_action |',
  '"all" means all `MODERATION_REPORT_ENTITY_TYPES`: `rss_feed_item`, `post`, `comment`, `user`, `url_hostname`.',
  '## Derived Lists',
  '- **Report reasons (List A)** — `MODERATION_REPORT_REASONS` — entries with `isReportReason: true`:',
  '  `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`',
  '- **AI content-policy categories (List B)** — `CONTENT_POLICY_CATEGORIES` — entries with',
  '  `isAiCategory: true`:',
  '  `spam`, `harassment`, `misinformation`, `illegal_content`, `hate_speech`, `sexual_content`, `violence`, `privacy_violation`, `off_topic`',
  '## Action Enums',
  '| Export | Values | Used by |\n| `MODERATION_JUDGEMENT_ACTIONS` | `no_action`, `warn`, `remove`, `escalate` | |\n| `MODERATION_APPEAL_ACTIONS` | `accept`, `deny`, `reduce` | |',
  '## Severity Levels',
  '| Level | Meaning |\n| low | |\n| medium | |\n| high | |\n| critical | |',
  '## Runbooks',
].join('\n')

export function topicTypesSource(entries: Record<string, string>, exported: boolean) {
  const prefix = exported ? 'export ' : ''
  return `${prefix}const topicTypes = {\n${Object.entries(entries)
    .map(
      ([value, slug]) =>
        `  ${value}: {\n    slug: '${slug}',\n    slugPlural: '${slug}s',\n    sitemap: true,\n  },`,
    )
    .join('\n')}\n} as const\n`
}

export function postTypeUnionSource(values: string[]) {
  return `export type PostType =\n${values.map(value => `  | '${value}'`).join('\n')}\nexport type PostBroadcast = 'everyone'\n`
}

export function postRouteConfigSource(entries: Record<string, string>) {
  const configs = postRouteConfigs(entries)
  return `export const postRouteConfigs = {\n${Object.entries(configs)
    .map(
      ([key, config]) =>
        `  ${key}: {\n    title: '${key}',\n    description: '${key}',\n    postTypes: ['${config.postType}'] as PostType[],\n    pluralPath: '${config.pluralPath}',\n    singularPath: '${config.singularPath}',\n  },`,
    )
    .join('\n')}\n}\nconst postSlugToType: Record<string, PostType> = {\n${Object.entries(entries)
    .map(([slug, value]) => `  '${slug}': '${value}',`)
    .join('\n')}\n}\n`
}

export function topicRouteConfigSource(entries: Record<string, string>) {
  return `export const topicRouteConfigs = {\n${Object.entries(entries)
    .map(
      ([value, slug]) =>
        `  ${slug}s: {\n    title: '${slug}',\n    description: '${slug}',\n    topicTypes: ['${value}'] as TopicTypes[],\n    pluralPath: '${slug}s',\n    singularPath: '${slug}',\n  },`,
    )
    .join('\n')}\n}\n`
}

export function postRouteConfigs(entries: Record<string, string>) {
  const pluralBySlug: Record<string, string> = {
    article: 'articles',
    'blog-post': 'blog',
    'data-point': 'data-points',
    discussion: 'discussions',
    review: 'reviews',
    story: 'stories',
  }
  return Object.fromEntries(
    Object.entries(entries).map(([slug, postType]) => [
      pluralBySlug[slug] ?? `${slug}s`,
      { postType, pluralPath: pluralBySlug[slug] ?? `${slug}s`, singularPath: slug },
    ]),
  )
}

export function publicPostSlugMap(postTypes: string[]) {
  const slugByType: Record<string, string> = {
    article: 'article',
    blog_post: 'blog-post',
    data_point: 'data-point',
    discussion: 'discussion',
    review: 'review',
    story: 'story',
  }
  return Object.fromEntries(
    postTypes.flatMap(value => {
      const slug = slugByType[value]
      return slug ? [[slug, value]] : []
    }),
  )
}

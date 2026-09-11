type SeededCommunity = {
  name: string
  slug: string
  markdown: string
}

const COMMUNITIES: SeededCommunity[] = [
  {
    name: 'Voucha Quality Filters',
    slug: 'voucha-quality-filters',
    markdown:
      'For virtually muting all topics that we have agents for (Self Promotion, Political, AI Generated, etc.)',
  },
  {
    name: 'Voucha Platform',
    slug: 'voucha-platform',
    markdown: 'For discussing the Voucha Platform as well as questions, support, etc.',
  },
]

function escapeSqlString(str: string): string {
  return str.replaceAll("'", "''")
}

export default function generateSeedCommunitiesSQL(): string {
  const parts: string[] = ['-- Seed platform communities']

  for (const community of COMMUNITIES) {
    const safeName = escapeSqlString(community.name)
    const safeSlug = escapeSqlString(community.slug)
    const safeMd = escapeSqlString(community.markdown)

    parts.push(`
WITH existing AS (SELECT id FROM communities WHERE slug = '${safeSlug}' LIMIT 1),
updated AS (
  UPDATE communities SET deleted_at = NULL, name = '${safeName}', markdown = '${safeMd}', visibility = 'public'
  WHERE id = (SELECT id FROM existing) RETURNING id
),
inserted AS (
  INSERT INTO communities (name, slug, markdown, visibility, created_by_id)
  SELECT '${safeName}', '${safeSlug}', '${safeMd}', 'public', (SELECT id FROM users WHERE username = 'system')
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
)
SELECT id FROM updated UNION ALL SELECT id FROM inserted;`)

    parts.push(`
INSERT INTO community_members (community_id, user_id, role)
SELECT c.id, u.id, 'owner' FROM communities c, users u
WHERE c.slug = '${safeSlug}' AND u.username = 'system'
ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL
DO UPDATE SET role = 'owner', removed_at = NULL;`)
  }

  return parts.join('\n')
}

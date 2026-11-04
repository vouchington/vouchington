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

/** loaded by path by the config-driven migration runner */
export default function generateSeedCommunitiesSQL(): string {
  const parts: string[] = ['-- Seed platform communities']

  for (const community of COMMUNITIES) {
    const safeName = escapeSqlString(community.name)
    const safeSlug = escapeSqlString(community.slug)
    const safeMd = escapeSqlString(community.markdown)

    // Fixed bootstrap owners are created only with their community. Replaying seeds must
    // preserve later ownership changes and cannot bypass runtime membership admission caps.
    parts.push(`
WITH existing AS (SELECT id FROM communities WHERE slug = '${safeSlug}' LIMIT 1),
updated AS (
  UPDATE communities SET deleted_at = NULL, name = '${safeName}', markdown = '${safeMd}', visibility = 'public'
  WHERE id = (SELECT id FROM existing) RETURNING id
),
inserted AS (
  INSERT INTO communities (name, slug, markdown, visibility, created_by_id, created_via)
  SELECT '${safeName}', '${safeSlug}', '${safeMd}', 'public', (SELECT id FROM users WHERE username = 'system'), 'system'
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
),
owner_membership AS (
  INSERT INTO community_members (community_id, user_id, role)
  SELECT inserted.id, users.id, 'owner'
  FROM inserted CROSS JOIN users
  WHERE users.username = 'system'
  ON CONFLICT (community_id, user_id) WHERE removed_at IS NULL DO NOTHING
)
SELECT id FROM updated UNION ALL SELECT id FROM inserted;`)
  }

  return parts.join('\n')
}

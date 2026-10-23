import type { DomainBlacklistSource } from '@voucha/types/entities/domain-blacklist-source'

function escapeSqlString(str: string): string {
  return str.replaceAll("'", "''")
}

export function generateSQL(blacklists: DomainBlacklistSource[]): string {
  const parts: string[] = ['-- Seed domain blacklist sources']

  if (blacklists.length === 0) {
    return parts.join('\n')
  }

  const rows = blacklists
    .map(s => {
      const safeType = escapeSqlString(s.type)
      const safeName = escapeSqlString(s.name)
      const safeUrl = escapeSqlString(s.url)
      return `  ('${safeType}', '${safeName}', '${safeUrl}')`
    })
    .join(',\n')

  parts.push(`
INSERT INTO domain_blocklist_sources (type, name, url)
VALUES
${rows}
ON CONFLICT (name) DO NOTHING;

UPDATE domain_blocklist_sources source
SET type = input.type::domain_blocklist_types,
    etag = NULL,
    last_modified_at = NULL
FROM (VALUES
${rows}
) AS input(type, name, url)
WHERE source.name = input.name
  AND source.type IS DISTINCT FROM input.type::domain_blocklist_types;

UPDATE domain_blocklist_sources source
SET url = input.url,
    etag = NULL,
    last_modified_at = NULL
FROM (VALUES
${rows}
) AS input(type, name, url)
WHERE source.name = input.name AND source.url IS DISTINCT FROM input.url;`)

  return parts.join('\n')
}

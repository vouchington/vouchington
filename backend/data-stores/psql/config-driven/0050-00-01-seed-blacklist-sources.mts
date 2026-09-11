import {
  BLACKLISTS,
  type DomainBlacklistSource,
} from '@voucha/types/entities/domain-blacklist-source'

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
INSERT INTO domain_blacklist_sources (type, name, url)
VALUES
${rows}
ON CONFLICT (name) DO UPDATE SET
  type = EXCLUDED.type,
  url = EXCLUDED.url;`)

  return parts.join('\n')
}

export default function generateSeedBlacklistSourcesSQL(): string {
  return generateSQL(BLACKLISTS)
}

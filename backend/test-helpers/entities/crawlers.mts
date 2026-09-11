import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertStaleFetchCrawlerForHostname(hostnameId: string): Promise<string[]> {
  const { rows } = await write(sql`
    INSERT INTO crawlers (
      hostname_id,
      description,
      crawler_type,
      priority,
      css_selectors_to_remove,
      link_text_content_to_remove,
      link_hrefs_to_remove,
      updated_at
    )
    VALUES (
      ${hostnameId},
      '',
      'fetch'::crawler_types,
      0,
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      CURRENT_TIMESTAMP - INTERVAL '14 days'
    )
    RETURNING id
  `)

  return rows.map(row => row.id as string)
}

/**
 * Insert test crawler and return its ID
 */
export async function insertTestCrawler(options: {
  hostnameId: string
  description: string
  crawlerType?: 'fetch' | 'automation'
  priority?: number
  cssSelectorsToRemove?: string[]
  linkTextContentToRemove?: string[]
  linkHrefsToRemove?: string[]
}): Promise<string> {
  const {
    hostnameId,
    description,
    crawlerType = 'fetch',
    priority = 100,
    cssSelectorsToRemove = [],
    linkTextContentToRemove = [],
    linkHrefsToRemove = [],
  } = options

  const result = await write(sql`
    INSERT INTO crawlers (
      hostname_id,
      description,
      crawler_type,
      priority,
      css_selectors_to_remove,
      link_text_content_to_remove,
      link_hrefs_to_remove
    ) VALUES (
      ${hostnameId},
      ${description},
      ${crawlerType}::crawler_types,
      ${priority},
      ${cssSelectorsToRemove},
      ${linkTextContentToRemove},
      ${linkHrefsToRemove}
    )
    RETURNING id
  `)

  return result.rows[0].id
}

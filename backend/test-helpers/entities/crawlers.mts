import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertStaleFetchCrawlerForHostname(hostnameId: string): Promise<string[]> {
  const { rows } = await write(
    sql`/* insertStaleFetchCrawlerForHostname */
    INSERT INTO hostname_crawler_configurations (
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
  `,
  )

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

  const result = await write<{ id: string }>(
    sql`/* insertTestCrawler */
    INSERT INTO hostname_crawler_configurations (
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
  `,
  )

  return result.rows[0].id
}

/** Inserts a crawler with a precise fixture timestamp without changing the updated-at trigger. */
export async function insertCrawlerRefreshStateForTest(input: {
  hostnameId: string
  updatedAt: Date
  deletedAt?: Date
}): Promise<void> {
  await write(sql`/* insertCrawlerRefreshStateForTest */
    INSERT INTO hostname_crawler_configurations (hostname_id, crawler_type, updated_at, deleted_at)
    VALUES (${input.hostnameId}, 'fetch', ${input.updatedAt}, ${input.deletedAt ?? null})
  `)
}

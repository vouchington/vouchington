import { write } from '../../backend/data-stores/psql/clients.mts'

// Seeded hostname: example.com (019c64e6-1000-7000-b000-000000000001)
const SEEDED_HOSTNAME_ID = '019c64e6-1000-7000-b000-000000000001'

/**
 * Insert a test crawler using the seeded example.com hostname.
 * Returns the crawler ID.
 */
export async function insertTestCrawler(description: string): Promise<string> {
  const result = await write(
    `INSERT INTO crawlers (hostname_id, description, crawler_type, priority, css_selectors_to_remove, link_text_content_to_remove, link_hrefs_to_remove)
     VALUES ($1, $2, 'fetch'::crawler_types, 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[])
     RETURNING id`,
    [SEEDED_HOSTNAME_ID, description],
  )
  return result.rows[0].id as string
}

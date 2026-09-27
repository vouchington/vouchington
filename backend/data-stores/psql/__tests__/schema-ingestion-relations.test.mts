import { randomUUID } from 'node:crypto'
import { write } from '../index.mts'
import { describe, expect, it } from 'vitest'

async function rejectionCode(sql: string, values?: unknown[]): Promise<string | undefined> {
  try {
    await write(sql, values)
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

describe('ingestion relational ownership', () => {
  it('rejects search params, recipients, categories, selectors, and links without their owners', async () => {
    const missing = randomUUID()
    await expect(
      rejectionCode(
        `INSERT INTO url_search_params (url_id, ordinal, param_name, param_value)
         VALUES ($1, 0, 'a', '1')`,
        [missing],
      ),
    ).resolves.toBe('23503')
    await expect(
      rejectionCode(
        `INSERT INTO ses_bounce_event_recipients (ses_bounce_event_id, ordinal, email)
         VALUES ($1, 0, 'tests@example.com')`,
        [missing],
      ),
    ).resolves.toBe('23503')
    await expect(
      rejectionCode(
        `INSERT INTO rss_feed_item_source_category_snapshot_categories
           (rss_feed_id, rss_feed_item_id, ordinal, category_text)
         VALUES ($1, $1, 0, 'News')`,
        [missing],
      ),
    ).resolves.toBe('23503')
    await expect(
      rejectionCode(
        `INSERT INTO boilerplate_removal_results
           (boilerplate_removal_id, kind, ordinal, value)
         VALUES ($1, 'css_selector', 0, '.nav')`,
        [missing],
      ),
    ).resolves.toBe('23503')
    await expect(
      rejectionCode(
        `INSERT INTO crawl_links (crawl_id, rel, shape, subtype, ordinal, href)
         VALUES (uuidv7(), 'canonical', 'string', '', 0, 'https://example.com/page')`,
      ),
    ).resolves.toBe('23503')
  })

  it('keeps an explicit empty category snapshot distinct from a missing snapshot', async () => {
    await expect(
      rejectionCode(
        `INSERT INTO rss_feed_item_category_snapshot_reconciliation_categories
           (rss_feed_item_id, ordinal, category_text)
         VALUES ($1, 0, 'News')`,
        [randomUUID()],
      ),
    ).resolves.toBe('23503')
  })
})

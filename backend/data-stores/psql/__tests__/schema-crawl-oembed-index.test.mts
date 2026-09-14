import { getCrawlOembedPendingIndexDefinition } from '../../../test-helpers/data-stores/psql/crawl-oembed-index.mts'
import { describe, expect, it } from 'vitest'

describe('crawl oEmbed schema', () => {
  it('indexes the pending reconciliation predicate by crawl id', async () => {
    const indexdef = await getCrawlOembedPendingIndexDefinition()

    expect(indexdef).toContain('USING btree (id)')
    expect(indexdef).toContain('embed_metadata IS NOT NULL')
    expect(indexdef).toContain('embed_oembed_url IS NOT NULL')
    expect(indexdef).toContain('embed_oembed_resolved_at IS NULL')
  })
})

import { read } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'

describe('crawl oEmbed schema', () => {
  it('indexes the pending reconciliation predicate by crawl id', async () => {
    const { rows } = await read<{ indexdef: string }>(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'crawls'
        AND indexname = 'crawls_oembed_pending_idx'
    `)

    expect(rows[0]?.indexdef).toContain('USING btree (id)')
    expect(rows[0]?.indexdef).toContain('embed_metadata IS NOT NULL')
    expect(rows[0]?.indexdef).toContain('embed_oembed_url IS NOT NULL')
    expect(rows[0]?.indexdef).toContain('embed_oembed_resolved_at IS NULL')
  })
})

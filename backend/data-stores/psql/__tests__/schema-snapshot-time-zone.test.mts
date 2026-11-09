import { afterAll, describe, expect, it, vi } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { readSchemaCatalog } from '../schema-snapshot/catalog-queries.mts'

// node-postgres forwards PGOPTIONS to every new connection, so each pooled session starts in Los
// Angeles time, like a Homebrew server configured with TimeZone = America/Los_Angeles.
vi.hoisted(() => {
  process.env.PGOPTIONS = '-c TimeZone=America/Los_Angeles'
})

describe('readSchemaCatalog', () => {
  afterAll(onGracefulShutdown)

  it('renders timestamptz constants in UTC whatever the session TimeZone is', async () => {
    const { indexes } = await readSchemaCatalog()
    const index = indexes.find(
      ({ index_name }) => index_name === 'idx_urls__hostname_feed_rank_latest_published_id',
    )

    expect(index?.definition).toContain("'1970-01-01 00:00:00+00'::timestamp with time zone")
  })
})

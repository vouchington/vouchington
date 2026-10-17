import { onTestFinished, describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userImportExportConfig } from './config.mts'
import { getRssFeedImport, submitRssFeedImport } from './rss-feed-imports.mts'

describe('large RSS feed imports', () => {
  it('stores an import above 500 URLs in bounded insert chunks while preserving row order', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_insert_chunk_size: 100 }),
    )
    const user = await createTestUser()
    const suffix = Date.now()
    const urls = Array.from(
      { length: 501 },
      (_, index) => `https://scale-import-${suffix}-${index}.example.com/rss`,
    )

    const created = await submitRssFeedImport(user, WEB_PROVENANCE, urls, {
      should_follow_imported_feeds: false,
    })
    const status = await getRssFeedImport(user.id, created.import.id)

    expect(status?.import).toMatchObject({ total_rows: 501, pending_rows: 501 })
    expect(status?.rows).toHaveLength(501)
    expect(status?.rows.map(row => row.input)).toEqual(urls)
  })
})

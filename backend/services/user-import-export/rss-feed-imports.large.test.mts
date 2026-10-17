import { randomUUID } from 'node:crypto'
import { onTestFinished, describe, expect, it } from 'vitest'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userImportExportConfig } from './config.mts'
import { getRssFeedImport, submitRssFeedImport } from './rss-feed-imports.mts'

describe('large RSS feed imports', () => {
  it('stores an import above 500 URLs in bounded insert chunks and lists it in row order', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, {
        import_insert_chunk_size: 100,
        import_status_page_size: 100,
      }),
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
    const inputs: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const status = await getRssFeedImport(user.id, created.import.id, { after: cursor })
      expect(status?.import).toMatchObject({ total_rows: 501, pending_rows: 501 })
      expect(status!.rows.length).toBeLessThanOrEqual(100)
      inputs.push(...status!.rows.map(row => row.input))
      cursor = status!.page_info.has_next_page
        ? (status!.page_info.end_cursor ?? undefined)
        : undefined
      pages += 1
    } while (cursor)

    expect(pages).toBe(6)
    expect(inputs).toEqual(urls)
  })

  it('lists no more rows than the configured page size, whatever limit is asked for', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_status_page_size: 2 }),
    )
    const user = await createTestUser()
    const suffix = Date.now()
    const urls = Array.from(
      { length: 5 },
      (_, index) => `https://page-import-${suffix}-${index}.example.com/rss`,
    )
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, urls, {
      should_follow_imported_feeds: false,
    })

    const first = await getRssFeedImport(user.id, created.import.id, { limit: 500 })
    expect(first?.rows.map(row => row.input)).toEqual(urls.slice(0, 2))
    expect(first?.page_info.has_next_page).toBe(true)

    const narrowed = await getRssFeedImport(user.id, created.import.id, { limit: 1 })
    expect(narrowed?.rows).toHaveLength(1)

    const second = await getRssFeedImport(user.id, created.import.id, {
      after: first!.page_info.end_cursor!,
    })
    const last = await getRssFeedImport(user.id, created.import.id, {
      after: second!.page_info.end_cursor!,
    })
    expect(last?.rows.map(row => row.input)).toEqual(urls.slice(4))
    expect(last?.page_info.has_next_page).toBe(false)
    await expect(
      getRssFeedImport(user.id, created.import.id, { after: 'not-a-cursor' }),
    ).rejects.toMatchObject({ status: 400 })
    // A well-formed cursor of this import that names no row is refused, not read as the end.
    const unknownRow = encodeScopedUuidCursor(
      randomUUID(),
      `rss-feed-import-rows:${created.import.id}:row-index-asc`,
    )
    await expect(
      getRssFeedImport(user.id, created.import.id, { after: unknownRow }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

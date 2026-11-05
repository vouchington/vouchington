import '@services/bookmarks'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestRssFeedDirect,
  getRssFeedFollowExistsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  getRssFeedImportRowIds,
  createRssFeedImportRowForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { importSingleRssFeed } from './import-rss-feeds.mts'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitAndDispatchRssFeedImport,
} from './rss-feed-imports.mts'

const relation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'rss_feed',
  predicate: 'follow',
})

describe('RSS import follow limits', () => {
  it('reports skipped rows and retains the source while active follows still succeed', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_rss_feed: 1 }))
    const user = await createTestUser()
    const urls = [0, 1].map(() => `https://import-limit-${randomUUID()}.example.com/feed.xml`)
    const [first, second] = await Promise.all(
      urls.map(rssFeedUrl => insertTestRssFeedDirect({ rssFeedUrl })),
    )
    await upsertEntityRelation(user, relation, user, [first!])
    const submitted = await submitAndDispatchRssFeedImport(user, WEB_PROVENANCE, urls)
    const rows = await getRssFeedImportRowIds(submitted.import.id)
    for (const rowId of rows) await processRssFeedImportRow(submitted.import.id, rowId)
    const status = await getRssFeedImport(user.id, submitted.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 1,
      failed_rows: 1,
      skipped_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows).toMatchObject([
      { status: 'already_following', entity_id: first!.id },
      { status: 'error', error_code: 'RELATION_LIMIT_REACHED', entity_id: second!.id },
    ])
    expect(await getRssFeedFollowExistsForTest(user.id, second!.id)).toBe(false)
  })

  it('reports an optional follow skipped after a new source is created', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_rss_feed: 1 }))
    const user = await createTestUser()
    const first = await insertTestRssFeedDirect({})
    await upsertEntityRelation(user, relation, user, [first])
    const url = `https://new-import-limit-${randomUUID()}.example.com/feed.xml`
    const importRowId = await createRssFeedImportRowForTest(user.id, url)
    const result = await importSingleRssFeed(user, WEB_PROVENANCE, url, {
      importRowId,
      crawlerRssOptions: {
        dependencies: {
          fetchUrl: async () => ({
            response: new Response(
              '<rss version="2.0"><channel><title>Limit test</title></channel></rss>',
              { headers: { 'content-type': 'application/rss+xml' } },
            ),
            responseSignal: new AbortController().signal,
          }),
        },
      },
    })
    expect(result).toMatchObject({ status: 'error', error_code: 'RELATION_LIMIT_REACHED' })
    expect(result.entity_id).toBeTruthy()
    expect(await getRssFeedFollowExistsForTest(user.id, result.entity_id!)).toBe(false)
  })
})

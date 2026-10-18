/**
 * A user RSS feed import is submitted by a request but processed by a queue job. The batch stores
 * the submitting request's provenance, and the job records it on every feed the import creates
 * instead of falling back to `system`.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getFirstRssFeedImportRowId } from '@voucha/test-helpers/rss-feed-import-rows'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  readTestContentProvenance,
  rewriteRssFeedImportBatchProvenanceForTest,
} from '@voucha/test-helpers'
import {
  deleteContentProvenanceOAuthClient,
  insertContentProvenanceOAuthClient,
} from '@voucha/test-helpers/data-stores/psql/content-provenance'
import type { PrivateUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'

const feedFetchOptions = {
  dependencies: {
    fetchUrl: async () => ({
      response: new Response(
        '<rss version="2.0"><channel><title>Provenance import feed</title></channel></rss>',
        { headers: { 'content-type': 'application/rss+xml' } },
      ),
      responseSignal: new AbortController().signal,
    }),
  },
}

const newFeedUrl = () => `https://import-provenance-${randomUUID()}.example.com/feed.xml`

describe('user RSS feed import provenance', () => {
  let user: PrivateUser
  let oauthClientId: string

  beforeAll(async () => {
    ;[user, oauthClientId] = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      insertContentProvenanceOAuthClient(),
    ])
  })

  async function submitAndProcess(provenance: ContentProvenance) {
    const importUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const created = await submitRssFeedImport(importUser, provenance, [newFeedUrl()], {
      should_follow_imported_feeds: false,
    })
    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
      { crawlerRssOptions: feedFetchOptions },
    )
    const status = await getRssFeedImport(importUser.id, created.import.id)
    return { created, status }
  }

  it.each([
    ['a web session', () => ({ createdVia: 'web', oauthClientId: null }) as const],
    ['a native session', () => ({ createdVia: 'swift', oauthClientId: null }) as const],
    ['an API key', () => ({ createdVia: 'api', oauthClientId: null }) as const],
    ['an OAuth client over MCP', () => ({ createdVia: 'mcp', oauthClientId }) as const],
    ['an OAuth client over the API', () => ({ createdVia: 'api', oauthClientId }) as const],
  ])('records the submitting channel for %s on the batch and its feed', async (_label, build) => {
    const provenance: ContentProvenance = build()

    const { created, status } = await submitAndProcess(provenance)

    await expect(
      readTestContentProvenance('user_rss_feed_import_batches', created.import.id),
    ).resolves.toEqual(provenance)
    expect(status?.rows[0]).toMatchObject({ status: 'source_created' })
    await expect(
      readTestContentProvenance('rss_feeds', status!.rows[0]!.entity_id!),
    ).resolves.toEqual(provenance)
  })

  it('keeps each batch on its own provenance when jobs run interleaved', async () => {
    const web: ContentProvenance = { createdVia: 'web', oauthClientId: null }
    const mcp: ContentProvenance = { createdVia: 'mcp', oauthClientId }
    const [webImport, mcpImport] = await Promise.all([
      submitRssFeedImport(user, web, [newFeedUrl()], { should_follow_imported_feeds: false }),
      submitRssFeedImport(user, mcp, [newFeedUrl()], { should_follow_imported_feeds: false }),
    ])

    await Promise.all(
      [mcpImport, webImport].map(async created =>
        processRssFeedImportRow(
          created.import.id,
          await getFirstRssFeedImportRowId(created.import.id),
          {
            crawlerRssOptions: feedFetchOptions,
          },
        ),
      ),
    )

    const feedIds = await Promise.all(
      [webImport, mcpImport].map(async created => {
        const status = await getRssFeedImport(user.id, created.import.id)
        return status!.rows[0]!.entity_id!
      }),
    )
    await expect(readTestContentProvenance('rss_feeds', feedIds[0]!)).resolves.toEqual(web)
    await expect(readTestContentProvenance('rss_feeds', feedIds[1]!)).resolves.toEqual(mcp)
  })

  it('keeps provenance out of the import summary and row results', async () => {
    const { created, status } = await submitAndProcess({ createdVia: 'mcp', oauthClientId })

    expect(Object.keys(created.import).toSorted()).toEqual([
      'completed_at',
      'completed_rows',
      'created_at',
      'failed_rows',
      'id',
      'pending_rows',
      'total_rows',
    ])
    expect(JSON.stringify({ created, status })).not.toMatch(/created_via|oauth/)
  })

  it('keeps the stored provenance immutable', async () => {
    const created = await submitRssFeedImport(
      user,
      { createdVia: 'api', oauthClientId },
      [newFeedUrl()],
      { should_follow_imported_feeds: false },
    )

    await expect(
      rewriteRssFeedImportBatchProvenanceForTest(created.import.id, {
        createdVia: 'system',
        oauthClientId: null,
      }),
    ).rejects.toThrow('rows are append-only')
    await expect(
      rewriteRssFeedImportBatchProvenanceForTest(created.import.id, {
        createdVia: 'api',
        oauthClientId: null,
      }),
    ).rejects.toThrow('rows are append-only')
  })

  it('rejects an OAuth client on a channel that cannot name one', async () => {
    await expect(
      submitRssFeedImport(
        user,
        { createdVia: 'web', oauthClientId } as unknown as ContentProvenance,
        [newFeedUrl()],
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects an OAuth client that does not exist', async () => {
    await expect(
      submitRssFeedImport(user, { createdVia: 'mcp', oauthClientId: randomUUID() }, [newFeedUrl()]),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('keeps an OAuth client that submitted an import', async () => {
    const submittingClientId = await insertContentProvenanceOAuthClient()
    await submitRssFeedImport(user, { createdVia: 'mcp', oauthClientId: submittingClientId }, [
      newFeedUrl(),
    ])

    await expect(deleteContentProvenanceOAuthClient(submittingClientId)).rejects.toMatchObject({
      code: '23001',
    })
  })
})

import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestRelationDeletedAt,
  insertTestPost,
  insertTestPostRelatedUrlBatch,
  insertTestTopicBatch,
  insertTestTopicLandingPageUrlRelations,
  insertTestUrlDirect,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScopes } from '@voucha/test-helpers/publication-effect-jobs'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import type { PrivateUser } from '@voucha/types/entities/user'
import { v7 as uuidv7 } from 'uuid'
import {
  ensureHostnameBlockCleanupOperation,
  getHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import { toHostnameBlockOperationResult } from './cleanup-operation-result.mts'
import {
  advanceHostnameBlockPenaltyPage,
  getHostnameBlockPenaltyPage,
} from './cleanup-penalties.mts'
import { projectNextHostnameBlockSubdomainPage } from './cleanup-subdomains.mts'
import { deleteUrlRelationPage } from './delete-url-relation-page.mts'
import { getHostnameCleanupPage } from './relation-cleanup-pages.mts'
import { softDeleteNextBlockedHostnameRelationPage } from './soft-delete-relation-page.mts'

describe('bounded hostname block relation cleanup', () => {
  it('keeps an independently blocked child with its first cleanup owner', async () => {
    const administrator = await createAdministrator('owner')
    const rootHostname = randomHostname('owner')
    const childHostname = `child.${rootHostname}`
    const [rootId, childId] = await Promise.all([
      insertTestUrlHostname({ hostname: rootHostname }),
      insertTestUrlHostname({ hostname: childHostname }),
    ])
    const child = await createOperation(childId, childHostname, administrator.id, false)
    const root = await createOperation(rootId, rootHostname, administrator.id, true)

    const projection = await projectNextHostnameBlockSubdomainPage(
      root.blockId,
      root.progress,
      undefined,
      10,
    )
    const repeatedChild = await createOperation(childId, childHostname, administrator.id, true)
    await using query = await beginTransaction()
    const ownership = await getHostnameCleanupPage(query, projection.operation!, undefined, 10)
    await query.commit()

    expect(repeatedChild.blockId).toBe(child.blockId)
    expect((await getHostnameBlockCleanupOperation(child.blockId))?.penalizeCreators).toBe(false)
    expect(ownership).toEqual([
      expect.objectContaining({ id: rootId, owned: true }),
      expect.objectContaining({ id: childId, owned: false }),
    ])
  })

  it('deletes a bounded relation page and durably attributes its penalty to the block event', async () => {
    const [administrator, creator] = await Promise.all([
      createAdministrator('pipeline'),
      createTestUserDirect({ username: `hostname-creator-${randomToken()}` }),
    ])
    const rootHostname = randomHostname('pipeline')
    const childHostname = `child.${rootHostname}`
    const [rootId, childId] = await Promise.all([
      insertTestUrlHostname({ hostname: rootHostname }),
      insertTestUrlHostname({ hostname: childHostname }),
    ])
    const postId = await insertTestPost({
      title: `Hostname cleanup ${randomToken()}`,
      slug: `hostname-cleanup-${randomToken()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const urlId = uuidv7()
    await insertTestPostRelatedUrlBatch({
      postIds: [postId],
      urlIds: [urlId],
      hostname: childHostname,
      hostnameId: childId,
      createdById: creator.id,
    })

    const initialOperation = await createOperation(rootId, rootHostname, administrator.id, true)
    const projection = await projectNextHostnameBlockSubdomainPage(
      initialOperation.blockId,
      initialOperation.progress,
      undefined,
      10,
    )
    let processed!: Awaited<ReturnType<typeof processRelations>>
    const jobs = await captureAddedPublicationEffectsForScopes([postId], async () => {
      processed = await processRelations(projection.operation!, projection.cursor)
    })
    expect(processed.cursor).toEqual({ stage: 'penalties' })
    expect(await getTestRelationDeletedAt(postId, urlId)).toBeInstanceOf(Date)
    expect(
      jobs.filter(job => job.reason === 'post_related_urls_changed' && job.postId === postId),
    ).toHaveLength(1)
    await expect(getHostnameBlockPenaltyPage(processed.operation, undefined, 10)).resolves.toEqual([
      creator.id,
    ])

    const completed = await advanceHostnameBlockPenaltyPage(
      processed.operation.blockId,
      processed.operation.progress,
      true,
    )
    expect(completed?.completedAt).toBeInstanceOf(Date)
    expect(toHostnameBlockOperationResult(completed!)).toEqual({
      operation_id: initialOperation.blockId,
      status: 'completed',
      totals: {
        blocked_hostname_count: 2,
        soft_deleted_relation_count: 1,
        penalized_user_count: 1,
      },
    })
  })

  it('resumes an exact-limit post relation page without repeating the first relation', async () => {
    const [administrator, creator] = await Promise.all([
      createAdministrator('relation-cursor'),
      createTestUserDirect({ username: `relation-cursor-${randomToken()}` }),
    ])
    const hostname = randomHostname('relation-cursor')
    const hostnameId = await insertTestUrlHostname({ hostname })
    const postIds = await Promise.all(
      ['first', 'second'].map(label =>
        insertTestPost({
          title: `${label} relation cursor ${randomToken()}`,
          slug: `${label}-relation-cursor-${randomToken()}`,
          createdById: creator.id,
          markdown: 'test',
        }),
      ),
    )
    const urlIds = [uuidv7(), uuidv7()]
    await insertTestPostRelatedUrlBatch({
      postIds,
      urlIds,
      hostname,
      hostnameId,
      createdById: creator.id,
    })

    await using query = await beginTransaction()
    const first = await deleteUrlRelationPage(
      query,
      'relation__post__related__url',
      urlIds,
      undefined,
      administrator.id,
      1,
    )
    expect(first.page).toHaveLength(1)
    const second = await deleteUrlRelationPage(
      query,
      'relation__post__related__url',
      urlIds,
      first.page[0],
      administrator.id,
      1,
    )
    await query.commit()

    expect(second.page).toHaveLength(1)
    expect(second.page[0]).not.toEqual(first.page[0])
    await expect(
      Promise.all(postIds.map((postId, index) => getTestRelationDeletedAt(postId, urlIds[index]!))),
    ).resolves.toEqual([expect.any(Date), expect.any(Date)])
  })

  it('continues an exact-limit ordinary relation page without repeating a creator penalty', async () => {
    const [administrator, creator] = await Promise.all([
      createAdministrator('ordinary-page'),
      createTestUserDirect({ username: `hostname-ordinary-creator-${randomToken()}` }),
    ])
    const hostname = randomHostname('ordinary-page')
    const url = await insertTestUrlDirect(creator.id, `https://${hostname}/landing`)
    if (!url) throw new Error('Expected a public test URL')
    const topicIds = await insertTestTopicBatch({
      count: 2,
      createdById: creator.id,
      prefix: `ordinary-relation-${randomToken()}`,
    })
    await insertTestTopicLandingPageUrlRelations({
      topicIds,
      urlId: url.id,
      createdById: creator.id,
    })

    const operation = await createOperation(url.hostname.id, hostname, administrator.id, true)
    const tableIndex = getEntityRelationUrlTables().indexOf('relation__topic__landing_page__url')
    expect(tableIndex).toBeGreaterThanOrEqual(0)
    const cursor: Extract<HostnameBlockCleanupCursor, { stage: 'relations' }> = {
      stage: 'relations',
      hostnames: [
        {
          id: url.hostname.id,
          reversedHostname: hostname.split('.').toReversed().join('.'),
          owned: true,
        },
      ],
      hostnameIndex: 0,
      hostnamesExhausted: true,
      urlIds: [url.id],
      urlsExhausted: true,
      tableIndex,
    }

    const first = await softDeleteNextBlockedHostnameRelationPage(
      operation.blockId,
      operation.progress,
      cursor,
      { hostname: 1, url: 1, relation: 1 },
    )
    expect(first).toMatchObject({
      deleted: 1,
      operation: { softDeletedRelationCount: 1, penalizedUserCount: 1 },
      cursor: { stage: 'relations', tableIndex, relationAfter: expect.any(Object) },
    })
    const firstCursor = first.cursor
    if (firstCursor.stage !== 'relations') throw new Error('Expected relation continuation')
    const second = await softDeleteNextBlockedHostnameRelationPage(
      operation.blockId,
      first.operation!.progress,
      firstCursor,
      { hostname: 1, url: 1, relation: 1 },
    )
    expect(second).toMatchObject({
      deleted: 1,
      operation: { softDeletedRelationCount: 2, penalizedUserCount: 1 },
      cursor: { stage: 'relations', tableIndex, relationAfter: expect.any(Object) },
    })
    expect(second.cursor).not.toEqual(first.cursor)
  })
})

async function createOperation(
  hostnameId: string,
  hostname: string,
  administratorId: string,
  penalizeCreators: boolean,
) {
  await using query = await beginTransaction()
  const operation = await ensureHostnameBlockCleanupOperation(
    query,
    hostnameId,
    hostname,
    administratorId,
    'admin',
    penalizeCreators,
  )
  await query.commit()
  return operation
}

async function processRelations(
  initialOperation: HostnameBlockCleanupOperation,
  initialCursor: HostnameBlockCleanupCursor,
): Promise<{ operation: HostnameBlockCleanupOperation; cursor: HostnameBlockCleanupCursor }> {
  let operation = initialOperation
  let cursor = initialCursor
  const maximumPages = getEntityRelationUrlTables().length + 8
  for (let page = 0; page < maximumPages && cursor.stage === 'relations'; page += 1) {
    const result = await softDeleteNextBlockedHostnameRelationPage(
      operation.blockId,
      operation.progress,
      cursor,
      { hostname: 10, url: 10, relation: 10 },
    )
    operation = result.operation!
    cursor = result.cursor
  }
  expect(cursor.stage).toBe('penalties')
  return { operation, cursor }
}

async function createAdministrator(suffix: string): Promise<PrivateUser> {
  return (await createTestUserDirect({
    username: `hostname-admin-${suffix}-${randomToken()}`,
    administrator: true,
  })) as PrivateUser
}

function randomHostname(suffix: string): string {
  return `hostname-${suffix}-${randomToken()}.example.com`
}

function randomToken(): string {
  return randomBytes(6).toString('hex')
}

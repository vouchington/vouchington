import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  countTestPostPublicationDirtyWorkForPostsWithReason,
  createTestUserDirect,
  getTestRelationDeletedAt,
  insertTestPost,
  insertTestPostRelatedUrlBatch,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import type { PrivateUser } from '@voucha/types/entities/user'
import { v7 as uuidv7 } from 'uuid'
import {
  ensureHostnameBlockCleanupOperation,
  getHostnameBlockCleanupOperation,
  toHostnameBlockOperationResult,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import {
  advanceHostnameBlockPenaltyPage,
  getHostnameBlockPenaltyPage,
} from './cleanup-penalties.mts'
import { projectNextHostnameBlockSubdomainPage } from './cleanup-subdomains.mts'
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
    const child = await createOperation(childId, administrator.id, false)
    const root = await createOperation(rootId, administrator.id, true)

    const projection = await projectNextHostnameBlockSubdomainPage(
      root.blockId,
      root.progress,
      undefined,
      10,
    )
    const repeatedChild = await createOperation(childId, administrator.id, true)
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

    const initialOperation = await createOperation(rootId, administrator.id, true)
    const projection = await projectNextHostnameBlockSubdomainPage(
      initialOperation.blockId,
      initialOperation.progress,
      undefined,
      10,
    )
    const processed = await processRelations(projection.operation!, projection.cursor)

    expect(processed.cursor).toEqual({ stage: 'penalties' })
    expect(await getTestRelationDeletedAt(postId, urlId)).toBeInstanceOf(Date)
    await expect(
      countTestPostPublicationDirtyWorkForPostsWithReason([postId], 'post_related_urls_changed'),
    ).resolves.toBe(1)
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
})

async function createOperation(
  hostnameId: string,
  administratorId: string,
  penalizeCreators: boolean,
) {
  await using query = await beginTransaction()
  const operation = await ensureHostnameBlockCleanupOperation(
    query,
    hostnameId,
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

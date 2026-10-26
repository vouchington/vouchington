import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUser,
  getTestHostnameRow,
  getTestPenaltiesByHostnameId,
  getTestRelationDeletedAt,
  insertTestPost,
  insertTestPostRelatedUrlBatch,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import { DEFAULT_PENALTY_MULTIPLIER } from '@services/vote-integrity/config'
import type { PrivateUser } from '@voucha/types/entities/user'
import { blockHostname } from './block-hostname.mts'
import {
  getHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import {
  advanceHostnameBlockPenaltyPage,
  getHostnameBlockPenaltyPage,
} from './cleanup-penalties.mts'
import { projectNextHostnameBlockSubdomainPage } from './cleanup-subdomains.mts'
import { softDeleteNextBlockedHostnameRelationPage } from './soft-delete-relation-page.mts'
import { unblockHostname } from './unblock-hostname.mts'

describe('blockHostname', () => {
  let administrator: PrivateUser

  beforeAll(async () => {
    administrator = (await createTestUser({ administrator: true })) as PrivateUser
  })

  it('rejects a missing hostname', async () => {
    await expect(blockHostname(administrator.id, uuidv7())).rejects.toMatchObject({ status: 404 })
  })

  it('blocks and introduces only the target before returning a durable pending operation', async () => {
    const hostname = randomHostname()
    const childHostname = `child.${hostname}`
    const [hostnameId, childId] = await Promise.all([
      insertTestUrlHostname({ id: uuidv7(), hostname, is_blocked: false }),
      insertTestUrlHostname({ id: uuidv7(), hostname: childHostname, is_blocked: false }),
    ])

    const result = await blockHostname(administrator.id, hostnameId)
    const [target, child, operation] = await Promise.all([
      getTestHostnameRow(hostnameId),
      getTestHostnameRow(childId),
      getHostnameBlockCleanupOperation(result.operation_id),
    ])

    expect(result).toEqual({ operation_id: expect.any(String), status: 'pending', totals: null })
    expect(target).toMatchObject({ is_blocked: true, blocked_by_id: administrator.id })
    expect(target?.publicly_introduced_at).toBeInstanceOf(Date)
    expect(child).toMatchObject({ is_blocked: false, publicly_introduced_at: null })
    expect(operation).toMatchObject({
      hostnameId,
      blockedHostnameCount: 1,
      softDeletedRelationCount: 0,
      penalizedUserCount: 0,
      completedAt: null,
    })
  })

  it('reuses the first active block operation and its immutable penalty intent', async () => {
    const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
    const first = await blockHostname(administrator.id, hostnameId, { penalizeCreators: false })
    const repeated = await blockHostname(administrator.id, hostnameId, { penalizeCreators: true })

    expect(repeated).toEqual(first)
    expect((await getHostnameBlockCleanupOperation(first.operation_id))?.penalizeCreators).toBe(
      false,
    )
  })

  it('rejects unblock until accepted cleanup completes, then leaves new relations alone', async () => {
    const hostname = randomHostname()
    const [hostnameId, childHostnameId] = await Promise.all([
      insertTestUrlHostname({ hostname }),
      insertTestUrlHostname({ hostname: `child.${hostname}` }),
    ])
    const result = await blockHostname(administrator.id, hostnameId, { penalizeCreators: true })
    const introducedAt = (await getTestHostnameRow(hostnameId))?.publicly_introduced_at

    await expect(unblockHostname(administrator.id, hostnameId)).rejects.toMatchObject({
      status: 409,
      message: 'Hostname cleanup is still in progress. Try unblocking again after it completes.',
    })
    expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(true)

    const initial = await getHostnameBlockCleanupOperation(result.operation_id)
    const projection = await projectNextHostnameBlockSubdomainPage(
      result.operation_id,
      initial!.progress,
      undefined,
      10,
    )
    expect((await getTestHostnameRow(childHostnameId))?.is_blocked).toBe(true)
    await expect(unblockHostname(administrator.id, childHostnameId)).rejects.toMatchObject({
      status: 409,
    })

    const completed = await completeCleanupOperation(projection.operation!, projection.cursor)
    await unblockHostname(administrator.id, hostnameId)

    const creator = await createTestUser({ username: `post-unblock-${randomToken()}` })
    const postId = await insertTestPost({
      title: `Post-unblock relation ${randomToken()}`,
      slug: `post-unblock-relation-${randomToken()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const urlId = uuidv7()
    await insertTestPostRelatedUrlBatch({
      postIds: [postId],
      urlIds: [urlId],
      hostname,
      hostnameId,
      createdById: creator.id,
    })
    const staleCleanup = await softDeleteNextBlockedHostnameRelationPage(
      completed.blockId,
      completed.progress,
      { stage: 'relations' },
      { hostname: 10, url: 10, relation: 10 },
    )

    expect(await getTestRelationDeletedAt(postId, urlId)).toBeNull()
    expect(staleCleanup.deleted).toBe(0)
    await expect(getHostnameBlockPenaltyPage(completed, undefined, 10)).resolves.toEqual([])
    expect(await getTestHostnameRow(hostnameId)).toMatchObject({
      is_blocked: false,
      publicly_introduced_at: introducedAt,
    })
  })

  it('keeps one active hostname penalty across unblock and reblock operations', async () => {
    const hostname = randomHostname()
    const hostnameId = await insertTestUrlHostname({ hostname })
    const creator = await createTestUser({ username: `reblock-creator-${randomToken()}` })
    const firstPostId = await insertTestPost({
      title: `First reblock relation ${randomToken()}`,
      slug: `first-reblock-relation-${randomToken()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    await insertTestPostRelatedUrlBatch({
      postIds: [firstPostId],
      urlIds: [uuidv7()],
      hostname,
      hostnameId,
      createdById: creator.id,
    })

    const first = await blockHostname(administrator.id, hostnameId)
    await completeAdmittedCleanup(first.operation_id)
    await unblockHostname(administrator.id, hostnameId)

    const secondPostId = await insertTestPost({
      title: `Second reblock relation ${randomToken()}`,
      slug: `second-reblock-relation-${randomToken()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    await insertTestPostRelatedUrlBatch({
      postIds: [secondPostId],
      urlIds: [uuidv7()],
      hostname,
      hostnameId,
      createdById: creator.id,
    })

    const second = await blockHostname(administrator.id, hostnameId)
    await completeAdmittedCleanup(second.operation_id)

    const activePenalties = (await getTestPenaltiesByHostnameId(hostnameId)).filter(
      penalty => penalty.revoked_at === null,
    )
    expect(activePenalties).toEqual([
      expect.objectContaining({
        user_id: creator.id,
        penalty_multiplier: DEFAULT_PENALTY_MULTIPLIER,
        source_hostname_block_id: first.operation_id,
      }),
    ])
  })
})

async function completeAdmittedCleanup(blockId: string): Promise<HostnameBlockCleanupOperation> {
  const initial = await getHostnameBlockCleanupOperation(blockId)
  const projection = await projectNextHostnameBlockSubdomainPage(
    blockId,
    initial!.progress,
    undefined,
    10,
  )
  return completeCleanupOperation(projection.operation!, projection.cursor)
}

async function completeCleanupOperation(
  initialOperation: HostnameBlockCleanupOperation,
  initialCursor: HostnameBlockCleanupCursor,
): Promise<HostnameBlockCleanupOperation> {
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
  expect(cursor).toEqual({ stage: 'penalties' })
  const userIds = await getHostnameBlockPenaltyPage(operation, undefined, 10)
  expect(userIds.length).toBeLessThan(10)
  const completed = await advanceHostnameBlockPenaltyPage(
    operation.blockId,
    operation.progress,
    userIds.length < 10,
  )
  expect(completed?.completedAt).toBeInstanceOf(Date)
  return completed!
}

function randomHostname(): string {
  return `block-test-${randomBytes(6).toString('hex')}.example.com`
}

function randomToken(): string {
  return randomBytes(6).toString('hex')
}

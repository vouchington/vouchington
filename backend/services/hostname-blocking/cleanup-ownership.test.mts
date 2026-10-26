import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUser,
  getTestPenaltiesByHostnameId,
  getTestRelationDeletedAt,
  insertTestPost,
  insertTestPostRelatedUrlBatch,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import type { HostnameBlockCleanupCursor } from '@queues/background/enqueues/hostname-blocking-jobs'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'
import { upsertUrlHostnames } from '@services/urls-hostnames'
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

describe('hostname block cleanup ownership', () => {
  it('keeps a pending child root authoritative when a later ancestor projects its subtree', async () => {
    const [administrator, creator] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ username: `cleanup-owner-${randomToken()}` }),
    ])
    const grandHostname = `cleanup-owner-${randomToken()}.example.com`
    const parentHostname = `parent.${grandHostname}`
    const leafHostname = `leaf.${parentHostname}`
    const [grandId, parentId, leafId] = await Promise.all([
      insertTestUrlHostname({ hostname: grandHostname }),
      insertTestUrlHostname({ hostname: parentHostname }),
      insertTestUrlHostname({ hostname: leafHostname }),
    ])
    const postId = await insertTestPost({
      title: `Cleanup ownership ${randomToken()}`,
      slug: `cleanup-ownership-${randomToken()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const urlId = uuidv7()
    await insertTestPostRelatedUrlBatch({
      postIds: [postId],
      urlIds: [urlId],
      hostname: leafHostname,
      hostnameId: leafId,
      createdById: creator.id,
    })

    const parent = await blockHostname(administrator.id, parentId, { penalizeCreators: false })
    const grand = await blockHostname(administrator.id, grandId, { penalizeCreators: true })

    const completedGrand = await completeAdmittedCleanup(grand.operation_id)
    expect(completedGrand.blockedHostnameCount).toBe(1)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeNull()

    const completedParent = await completeAdmittedCleanup(parent.operation_id)
    expect(completedParent.blockedHostnameCount).toBe(2)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeInstanceOf(Date)
    await expect(getTestPenaltiesByHostnameId(leafId)).resolves.toEqual([])
  })

  it('prefers the most-specific owned scope over inherited block row age', async () => {
    const [administrator, creator] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ username: `inherited-owner-${randomToken()}` }),
    ])
    const topHostname = `inherited-owner-${randomToken()}.example.com`
    const topId = await insertTestUrlHostname({ hostname: topHostname })
    const top = await blockHostname(administrator.id, topId, { penalizeCreators: false })
    await completeAdmittedCleanup(top.operation_id)

    const broadHostname = `broad.${topHostname}`
    const deepHostname = `deep.${broadHostname}`
    const leafHostname = `leaf.${deepHostname}`
    const broadId = (await upsertUrlHostnames(null, [broadHostname])).get(broadHostname)!
    const deepId = (await upsertUrlHostnames(null, [deepHostname])).get(deepHostname)!
    const leafId = (await upsertUrlHostnames(null, [leafHostname])).get(leafHostname)!
    const postId = await insertTestPost({
      title: `Inherited cleanup ownership ${randomToken()}`,
      slug: `inherited-cleanup-ownership-${randomToken()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const urlId = uuidv7()
    await insertTestPostRelatedUrlBatch({
      postIds: [postId],
      urlIds: [urlId],
      hostname: leafHostname,
      hostnameId: leafId,
      createdById: creator.id,
    })

    const deep = await blockHostname(administrator.id, deepId, { penalizeCreators: false })
    const broad = await blockHostname(administrator.id, broadId, { penalizeCreators: true })
    const leaf = await blockHostname(administrator.id, leafId, { penalizeCreators: true })

    expect(broad.operation_id.localeCompare(deep.operation_id)).toBeLessThan(0)
    expect(leaf).toEqual(deep)
    await completeAdmittedCleanup(broad.operation_id)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeNull()
    await completeAdmittedCleanup(deep.operation_id)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeInstanceOf(Date)
    await expect(getTestPenaltiesByHostnameId(leafId)).resolves.toEqual([])
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
  let operation = projection.operation!
  let cursor: HostnameBlockCleanupCursor = projection.cursor
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
  const completed = await advanceHostnameBlockPenaltyPage(
    operation.blockId,
    operation.progress,
    userIds.length < 10,
  )
  expect(completed?.completedAt).toBeInstanceOf(Date)
  return completed!
}

function randomToken(): string {
  return randomBytes(6).toString('hex')
}

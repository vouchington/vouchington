import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  beginTransaction,
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
import { getHostnameCleanupPage } from './relation-cleanup-pages.mts'
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

  it('gives a child its own root when the specific pending ancestor penalizes differently', async () => {
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
    expect(leaf.operation_id).not.toBe(deep.operation_id)
    await completeAdmittedCleanup(broad.operation_id)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeNull()
    await completeAdmittedCleanup(deep.operation_id)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeNull()
    await completeAdmittedCleanup(leaf.operation_id)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeInstanceOf(Date)
    await expect(getTestPenaltiesByHostnameId(leafId)).resolves.toHaveLength(1)
  })

  it('cleans a child blocked after its ancestor root left the subdomains stage', async () => {
    const [administrator, creator] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ username: `late-child-${randomToken()}` }),
    ])
    const rootHostname = `late-child-${randomToken()}.example.com`
    const childHostname = `child.${rootHostname}`
    const rootId = await insertTestUrlHostname({ hostname: rootHostname })
    const root = await blockHostname(administrator.id, rootId, { penalizeCreators: true })
    const projection = await projectAdmittedCleanup(root.operation_id)
    expect(projection.cursor).toEqual({ stage: 'relations' })
    expect(projection.operation).toMatchObject({ stage: 'relations', resumeAfter: null })

    // The child appears after the root left the subdomains stage, so the root cannot own it.
    const childId = await insertTestUrlHostname({ hostname: childHostname })
    const postId = await insertTestPost({
      title: `Late child ${randomToken()}`,
      slug: `late-child-${randomToken()}`,
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

    const child = await blockHostname(administrator.id, childId, { penalizeCreators: true })
    expect(child.operation_id).not.toBe(root.operation_id)

    await finishProjectedCleanup(projection)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeNull()
    await completeAdmittedCleanup(child.operation_id)
    await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeInstanceOf(Date)
    await expect(getTestPenaltiesByHostnameId(childId)).resolves.toHaveLength(1)
  })

  it('scans only the root and its descendants, not lexical siblings', async () => {
    const administrator = await createTestUser({ administrator: true })
    const rootHostname = `scan-range-${randomToken()}.example.com`
    const [rootId, childId, siblingId] = await Promise.all([
      insertTestUrlHostname({ hostname: rootHostname }),
      insertTestUrlHostname({ hostname: `child.${rootHostname}` }),
      // Sorts between the root and its descendants but is not in the subtree.
      insertTestUrlHostname({ hostname: `${rootHostname.slice(0, -4)}-x.com` }),
    ])
    const root = await blockHostname(administrator.id, rootId, { penalizeCreators: true })
    const operation = (await getHostnameBlockCleanupOperation(root.operation_id))!
    await using query = await beginTransaction()
    const page = await getHostnameCleanupPage(query, operation, undefined, 10)
    await query.commit()
    expect(page.map(hostname => hostname.id)).toEqual([rootId, childId])
    expect(page.map(hostname => hostname.id)).not.toContain(siblingId)
  })

  it('attaches a child blocked during the subdomains stage to the ancestor root', async () => {
    const administrator = await createTestUser({ administrator: true })
    const rootHostname = `early-child-${randomToken()}.example.com`
    const [rootId, childId] = await Promise.all([
      insertTestUrlHostname({ hostname: rootHostname }),
      insertTestUrlHostname({ hostname: `child.${rootHostname}` }),
    ])
    const root = await blockHostname(administrator.id, rootId, { penalizeCreators: true })
    const child = await blockHostname(administrator.id, childId, { penalizeCreators: true })
    expect(child.operation_id).toBe(root.operation_id)
    const differing = `other.${rootHostname}`
    const differingId = await insertTestUrlHostname({ hostname: differing })
    const own = await blockHostname(administrator.id, differingId, { penalizeCreators: false })
    expect(own.operation_id).not.toBe(root.operation_id)
  })
})

type Projection = Awaited<ReturnType<typeof projectNextHostnameBlockSubdomainPage>>

async function projectAdmittedCleanup(blockId: string): Promise<Projection> {
  const initial = await getHostnameBlockCleanupOperation(blockId)
  return projectNextHostnameBlockSubdomainPage(blockId, initial!.progress, undefined, 10)
}

async function completeAdmittedCleanup(blockId: string): Promise<HostnameBlockCleanupOperation> {
  return finishProjectedCleanup(await projectAdmittedCleanup(blockId))
}

async function finishProjectedCleanup(
  projection: Projection,
): Promise<HostnameBlockCleanupOperation> {
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

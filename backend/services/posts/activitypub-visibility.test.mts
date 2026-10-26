import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { observePostgresReadRoutingForTest } from '@voucha/test-helpers/postgres-read-routing'
import { canDistributeActivityPubLike } from './activitypub-visibility.mts'

describe('ActivityPub Like visibility', () => {
  it('reads the voted comment, root, and anonymous policy from primary before completion', async () => {
    const author = await createTestUserDirect()
    const rootId = await insertTestPost({
      createdById: author.id,
      title: 'Federated Like root',
      slug: `federated-like-root-${randomUUID()}`,
      markdown: 'Public root',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      title: 'Federated Like comment',
      slug: `federated-like-comment-${randomUUID()}`,
      markdown: 'Public comment',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })

    const routing = await observePostgresReadRoutingForTest()
    try {
      await expect(routing.run(() => canDistributeActivityPubLike(commentId))).resolves.toBe(true)
      expect(routing.primaryAcquisitions()).toBeGreaterThanOrEqual(3)
      expect(routing.replicaAcquisitions()).toBe(0)

      await setTestPostClearanceStatus(rootId, 'pending', author.id)
      await expect(routing.run(() => canDistributeActivityPubLike(commentId))).resolves.toBe(false)
      await setTestPostClearanceStatus(rootId, 'approved', author.id)
      await expect(routing.run(() => canDistributeActivityPubLike(commentId))).resolves.toBe(true)
      expect(routing.replicaAcquisitions()).toBe(0)
    } finally {
      await routing.close()
    }
  })
})

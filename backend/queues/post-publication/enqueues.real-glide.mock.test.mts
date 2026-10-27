import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { hashCapturedPublicationKeys } from '../../services/post-publication/captured-keys.mts'
import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { postPublicationHandlers } from '../../workers/post-publication/workers.mts'
import {
  enqueueBulkPostPublicationEffects,
  enqueuePostPublicationEffects,
  postPublicationEffectJobId,
} from './enqueues.mts'
import { postPublicationQueue } from './queues.mts'
import { enqueueLiveScopePostEffects } from '../../workers/post-publication/processors/direct-scope-post-effects.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

function payload(changeId: string, postId: string): PostPublicationEffectsJobData {
  const keys = [{ kind: 'impact_post' as const, uuidValue: postId }]
  return {
    changeId,
    postId,
    scope: { type: 'post', id: postId },
    reason: 'post_updated',
    keys,
    keyHash: hashCapturedPublicationKeys(keys),
    chunkIndex: 0,
    scopeStart: true,
    scopeTopicKeysCaptured: false,
    keyOffset: 0,
  }
}

describe('direct publication jobs through real GlideMQ', () => {
  afterAll(() => postPublicationQueue.close())

  it('starts one scope discovery chain for multiple captured old-key chunks', async () => {
    const authorId = randomUUID()
    const first: PostPublicationEffectsJobData = {
      ...payload(randomUUID(), authorId),
      postId: null,
      scope: { type: 'author', id: authorId },
    }
    const canonical: PostPublicationEffectsJobData = {
      ...first,
      keys: [],
      keyHash: hashCapturedPublicationKeys([]),
      chunkIndex: 0,
      scopeStart: false,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
      continuation: { kind: 'author_posts', subjectIds: [authorId], subjectIndex: 0, after: null },
    }
    const id = postPublicationEffectJobId(canonical)
    try {
      await enqueueLiveScopePostEffects(first)
      const admitted = await postPublicationQueue.getJob(id)
      expect(admitted?.data).toEqual(canonical)
      await enqueueLiveScopePostEffects({
        ...first,
        keys: [],
        keyHash: 'another-capture-page',
        chunkIndex: 1,
        scopeStart: false,
      })
      expect((await postPublicationQueue.getJob(id))?.data).toEqual(canonical)
      expect(await enqueuePostPublicationEffects(canonical)).toBeNull()
    } finally {
      await (await postPublicationQueue.getJob(id))?.remove()
    }
  })

  it('accepts two identical-key changes and deduplicates replay of either change', async () => {
    const postId = randomUUID()
    const first = payload(randomUUID(), postId)
    const second = payload(randomUUID(), postId)
    const firstId = postPublicationEffectJobId(first)
    const secondId = postPublicationEffectJobId(second)
    expect(firstId).not.toBe(secondId)
    expect(
      postPublicationHandlers.some(
        handler => handler.job.name === POST_PUBLICATION_EFFECTS_JOB.name,
      ),
    ).toBe(true)

    try {
      await enqueuePostPublicationEffects(first)
      expect((await postPublicationQueue.getJob(firstId))?.id).toBe(firstId)
      expect(await enqueuePostPublicationEffects(first)).toBeNull()
      await enqueuePostPublicationEffects(second)
      expect((await postPublicationQueue.getJob(secondId))?.id).toBe(secondId)
      expect(await enqueuePostPublicationEffects(second)).toBeNull()
      expect((await postPublicationQueue.getJob(firstId))?.data).toEqual(first)
      expect((await postPublicationQueue.getJob(secondId))?.data).toEqual(second)
    } finally {
      await Promise.all(
        [firstId, secondId].map(async id => (await postPublicationQueue.getJob(id))?.remove()),
      )
    }
  })

  it('keeps both stable change IDs when admitted through the bulk boundary', async () => {
    const postId = randomUUID()
    const first = payload(randomUUID(), postId)
    const second = payload(randomUUID(), postId)
    const ids = [postPublicationEffectJobId(first), postPublicationEffectJobId(second)]
    try {
      await enqueueBulkPostPublicationEffects([first, second])
      expect((await postPublicationQueue.getJob(ids[0]!))?.data).toEqual(first)
      expect((await postPublicationQueue.getJob(ids[1]!))?.data).toEqual(second)
      await enqueueBulkPostPublicationEffects([first, second])
      expect((await postPublicationQueue.getJob(ids[0]!))?.data).toEqual(first)
      expect((await postPublicationQueue.getJob(ids[1]!))?.data).toEqual(second)
    } finally {
      await Promise.all(ids.map(async id => (await postPublicationQueue.getJob(id))?.remove()))
    }
  })
  it('admits overlapping continuation chains without losing a different remaining subject', async () => {
    const postId = randomUUID()
    const first: PostPublicationEffectsJobData = {
      ...payload(randomUUID(), postId),
      continuation: {
        kind: 'post_slugs',
        subjectIds: [postId, randomUUID()],
        subjectIndex: 0,
        after: null,
      },
    }
    const second: PostPublicationEffectsJobData = {
      ...first,
      continuation: { ...first.continuation!, subjectIds: [postId, randomUUID()] },
    }
    const ids = [postPublicationEffectJobId(first), postPublicationEffectJobId(second)]
    try {
      await enqueuePostPublicationEffects(first)
      await enqueuePostPublicationEffects(second)
      expect((await postPublicationQueue.getJob(ids[0]!))?.data).toEqual(first)
      expect((await postPublicationQueue.getJob(ids[1]!))?.data).toEqual(second)
      expect(await enqueuePostPublicationEffects(first)).toBeNull()
      expect(await enqueuePostPublicationEffects(second)).toBeNull()
    } finally {
      await Promise.all(ids.map(async id => (await postPublicationQueue.getJob(id))?.remove()))
    }
  })
})

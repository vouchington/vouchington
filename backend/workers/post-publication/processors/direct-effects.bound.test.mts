import { createTopicAliases, linkTopicAlias } from '../../../services/topics/aliases.mts'
import { markTestTopicInactiveKeepingAliases } from '@voucha/test-helpers/publication-test-queries'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  insertTestPost,
  insertTestCommunity,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { executeTestPublicationChain } from '@voucha/test-helpers/publication-effect-chain'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-core/glide-mq-client.mts'
import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import {
  enqueuePostPublicationEffects,
  postPublicationEffectJobId,
} from '@queues/post-publication/enqueues'
import { postPublicationQueue } from '@queues/post-publication/queues'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { caches } from '@services/entity-cache/caches'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { communityTag } from '../../../../ts-shared/cache/index.mts'
import { processApplyPostPublicationEffects } from './direct-effects.mts'

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

describe('runtime publication scope and key bounds', () => {
  it('does not restart scope discovery after its first chain completes before a later key chunk', async () => {
    const author = await createTestUser()
    const topic = await createTestTopic({ hostname: `later-key-${randomUUID()}.example.com` })
    await insertTestPost({
      createdById: author.id,
      title: 'Scope once',
      slug: `scope-once-${randomUUID()}`,
      markdown: '',
    })
    const first: PostPublicationEffectsJobData = {
      ...payload(randomUUID(), author.id),
      postId: null,
      scope: { type: 'author', id: author.id },
      keys: [],
    }
    const worker = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'publication_scope_once',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      processor: job =>
        processApplyPostPublicationEffects(job.data as PostPublicationEffectsJobData),
      workerOptions: { blockTimeout: 100 },
    })
    const execute = async (data: PostPublicationEffectsJobData) => {
      const job = await worker.add(POST_PUBLICATION_EFFECTS_JOB, data, {
        jobId: postPublicationEffectJobId(data),
      })
      expect(await worker.settled(job)).toBe('completed')
      expect(await worker.queue.getJob(job.id)).toBeNull()
    }
    const firstJobs = await executeTestPublicationChain(first, execute)
    expect(
      firstJobs.filter(
        job => (job.data as PostPublicationEffectsJobData).continuation?.kind === 'author_posts',
      ),
    ).toHaveLength(1)
    await caches.topic_metrics.set(topic.id, 'old topic footprint')
    const keys = [{ kind: 'impact_topic' as const, uuidValue: topic.id }]
    const laterJobs = await executeTestPublicationChain(
      {
        ...first,
        keys,
        keyHash: hashCapturedPublicationKeys(keys),
        chunkIndex: 1,
        scopeStart: false,
      },
      execute,
    )
    expect(
      laterJobs.filter(
        job => (job.data as PostPublicationEffectsJobData).continuation?.kind === 'author_posts',
      ),
    ).toHaveLength(0)
    expect(await caches.topic_metrics.get(topic.id)).not.toBe('old topic')
  })

  it('processes every typed preimage key after the configured cap is lowered before execution', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 10 }),
    )
    const authors = await Promise.all([createTestUser(), createTestUser()])
    const communities = await Promise.all(
      authors.map(user =>
        insertTestCommunity({ createdById: user.id, slug: `lowered-${randomUUID()}` }),
      ),
    )
    const topics = await Promise.all(
      authors.map(() => createTestTopic({ hostname: `lowered-${randomUUID()}.example.com` })),
    )
    const posts = await Promise.all(
      authors.map(user =>
        insertTestPost({
          createdById: user.id,
          title: 'Lowered cap',
          slug: `lowered-${randomUUID()}`,
          markdown: '',
        }),
      ),
    )
    const keys: PostPublicationEffectsJobData['keys'] = [
      ...posts.map(uuidValue => ({ kind: 'impact_post' as const, uuidValue })),
      ...authors.map(user => ({ kind: 'identity_author' as const, uuidValue: user.id })),
      ...communities.map(community => ({
        kind: 'identity_community' as const,
        uuidValue: community.id,
      })),
      ...topics.map(topic => ({ kind: 'impact_topic' as const, uuidValue: topic.id })),
      { kind: 'impact_rss_feed_item', uuidValue: randomUUID() },
    ]
    const original: PostPublicationEffectsJobData = {
      ...payload(randomUUID(), posts[0]!),
      keys,
      keyHash: hashCapturedPublicationKeys(keys),
    }
    await Promise.all([
      ...posts.map(id => caches.post_metrics.set(id, 'old post')),
      ...authors.flatMap(user => [
        caches.user_metrics.set(user.id, 'old user'),
        caches.user_metrics.set(user.username!, 'old username'),
      ]),
      ...topics.flatMap(topic => [
        caches.topic_metrics.set(topic.id, 'old topic'),
        caches.topic_metrics.set(topic.slug, 'old topic slug'),
      ]),
    ])
    await enqueuePostPublicationEffects(original)
    const queued = await postPublicationQueue.getJob(postPublicationEffectJobId(original))
    if (!queued) throw new Error('Expected accepted old-cap payload')
    await queued.remove()
    overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 })
    const worker = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'publication_lowered_cap',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      processor: job =>
        processApplyPostPublicationEffects(job.data as PostPublicationEffectsJobData),
      workerOptions: { blockTimeout: 100 },
    })
    const admitted = await executeTestPublicationChain(original, async data => {
      const job = await worker.add(POST_PUBLICATION_EFFECTS_JOB, data, {
        jobId: postPublicationEffectJobId(data),
      })
      expect(await worker.settled(job)).toBe('completed')
    })
    for (const id of posts) expect(await caches.post_metrics.get(id)).not.toBe('old post')
    for (const user of authors) {
      expect(await caches.user_metrics.get(user.id)).not.toBe('old user')
      expect(await caches.user_metrics.get(user.username!)).not.toBe('old username')
    }
    for (const community of communities) {
      const tags = admitted.flatMap(job => (job.data as { tags?: string[] }).tags ?? [])
      expect(tags).toContain(communityTag(community.id))
      expect(tags).toContain(communityTag(community.slug))
    }
    for (const topic of topics) {
      expect(await caches.topic_metrics.get(topic.id)).not.toBe('old topic')
      expect(await caches.topic_metrics.get(topic.slug)).not.toBe('old topic slug')
    }
    const keyJobs = admitted.filter(
      job =>
        job.name === POST_PUBLICATION_EFFECTS_JOB.name &&
        !(job.data as PostPublicationEffectsJobData).continuation,
    )
    expect(keyJobs.map(job => (job.data as PostPublicationEffectsJobData).keyOffset)).toEqual(
      keys.slice(1).map((_, index) => index + 1),
    )
    expect(keyJobs.every(job => !(job.data as PostPublicationEffectsJobData).scopeStart)).toBe(true)
    expect(
      keyJobs.every(job => (job.data as PostPublicationEffectsJobData).keys.length === keys.length),
    ).toBe(true)
  })

  it('assigns an alias reassignment topic chain to its unique captured key after earlier chunks finish', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
    )
    const oldTopic = await createTestTopic({ hostname: `old-owner-${randomUUID()}.example.com` })
    const newTopic = await createTestTopic({ hostname: `new-owner-${randomUUID()}.example.com` })
    expect(oldTopic.id.localeCompare(newTopic.id)).toBeLessThan(0)
    const [alias] = await createTopicAliases(oldTopic.id, `owner-change-${randomUUID()}`, {
      skipSideEffects: true,
    })
    if (!alias) throw new Error('Expected alias fixture')
    await markTestTopicInactiveKeepingAliases(oldTopic.id)
    const jobs = await captureAddedPublicationEffectsForScope(alias.id, () =>
      linkTopicAlias(newTopic.id, alias.id, { skipSideEffects: true }),
    )
    expect(jobs[0]?.keys).toEqual([{ kind: 'impact_topic', uuidValue: oldTopic.id }])
    expect(jobs[1]?.keys).toEqual([{ kind: 'impact_topic', uuidValue: newTopic.id }])
    expect(jobs.filter(job => job.scopeStart)).toHaveLength(1)
    expect(jobs.every(job => job.scopeTopicKeysCaptured)).toBe(true)
    await caches.topic_metrics.set(oldTopic.id, 'old owner cache')
    await caches.topic_metrics.set(newTopic.id, 'new owner cache')
    const worker = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'publication_alias_pieces',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      processor: job =>
        processApplyPostPublicationEffects(job.data as PostPublicationEffectsJobData),
      workerOptions: { blockTimeout: 100 },
    })
    const observed: { name: string; data: unknown }[] = []
    for (const data of jobs) {
      // Finish and remove every earlier native child before admitting the next captured piece.
      observed.push(
        ...(await executeTestPublicationChain(data, async next => {
          const job = await worker.add(POST_PUBLICATION_EFFECTS_JOB, next, {
            jobId: postPublicationEffectJobId(next),
          })
          expect(await worker.settled(job)).toBe('completed')
          expect(await worker.queue.getJob(job.id)).toBeNull()
        })),
      )
    }
    for (const kind of ['topic_aliases', 'topic_merged_sources'])
      expect(
        observed.filter(job => {
          const continuation = (job.data as PostPublicationEffectsJobData).continuation
          return (
            continuation?.kind === kind &&
            continuation.subjectIds[0] === newTopic.id &&
            continuation.after === null
          )
        }),
      ).toHaveLength(1)
    expect(await caches.topic_metrics.get(oldTopic.id)).not.toBe('old owner cache')
    expect(await caches.topic_metrics.get(newTopic.id)).not.toBe('new owner cache')
  })
})

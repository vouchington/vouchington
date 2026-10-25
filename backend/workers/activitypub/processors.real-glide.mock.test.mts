import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { activitypub } from '@queues/activitypub/queues'
import { ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type { DistributeActivityData } from '@queues/activitypub/enqueues/delivery'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import {
  createFederatedUser,
  createRemoteActorFixture,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { createRandomString, insertTestPost } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processDistributeActivityJob } from './processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('ActivityPub worker paged dispatch', () => {
  it('commits two real follower pages and replays the first receipt without duplicating delivery', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(pagedDispatchConfig, { activitypub_page_size: 1 }),
    )
    const source = await createFederatedUser()
    const followers = await Promise.all([createRemoteActorFixture(), createRemoteActorFixture()])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })
    await Promise.all(
      followers.map(follower =>
        upsertEntityRelation(null, relation, { id: follower.id }, [{ id: source.id }], {
          origin: 'remote',
        }),
      ),
    )
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: source.id,
      title: `distribution ${suffix}`,
      slug: `distribution-${suffix}`,
      markdown: 'Bounded remote follower page',
    })
    const data: DistributeActivityData = {
      activityId: postId,
      activityType: 'Like',
      sourceUserId: source.id,
      targetPostId: postId,
    }
    const root = await activitypub.add(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name, data, {
      ...ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.options,
      jobId: `test-activitypub-page-${randomUUID()}`,
    })
    if (!root) throw new Error('Expected a root distribution job')
    const rootJob = root as Job<DistributeActivityData>
    const ownedJobs = [root]
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })

    const first = await processDistributeActivityJob(rootJob)
    expect(first).toMatchObject({ enqueued: 1, completed: false })
    const receipt = (
      (await activitypub.getJob(root.id)) as Job<
        DistributeActivityData & { dispatchReceipt?: unknown }
      >
    ).data.dispatchReceipt as { next?: DistributeActivityData } | undefined
    const next = receipt?.next
    if (!next?.cursor) throw new Error('Expected a persisted follower cursor')
    await expect(processDistributeActivityJob(rootJob)).resolves.toEqual(first)

    const pageId = createHash('sha256')
      .update(`${root.id}:${JSON.stringify(next)}`)
      .digest('hex')
    const continuation = await activitypub.getJob(`${root.name}__page__${pageId}`)
    if (!continuation) throw new Error('Expected a durable continuation job')
    ownedJobs.push(continuation)
    await expect(
      processDistributeActivityJob(continuation as Job<DistributeActivityData>),
    ).resolves.toMatchObject({
      enqueued: 1,
      completed: true,
    })
    const delivered = await activitypub.searchJobs({ name: 'activitypub.deliverActivity' })
    const ownDeliveries = delivered.filter(
      job => (job.data as { activityId?: string }).activityId === data.activityId,
    )
    expect(
      ownDeliveries.map(job => (job.data as { inboxUrl: string }).inboxUrl).toSorted(),
    ).toEqual(followers.map(follower => follower.inbox_url).toSorted())
    ownedJobs.push(...ownDeliveries)
  })
})

import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { randomUUID } from 'node:crypto'
import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import { describe, expect, it, onTestFinished } from 'vitest'
import { capturePublisherFeedPublicationJobs } from '@voucha/test-helpers/publisher-feed-publication-jobs'
import { recordPublisherTypeFeedPublicationWork } from '@services/post-publication/publisher-type-feeds'
import { recordPostTopicRelationPublicationChanges } from './post-topic-publication.mts'

describe('publisher-type publication admission', () => {
  it('admits work only after outer commit and drops rolled-back nested captures', async () => {
    const committed = randomUUID()
    const rejected = randomUUID()
    const rolledBack = randomUUID()
    const jobs = await capturePublisherFeedPublicationJobs(
      [committed, rejected, rolledBack],
      async () => {
        {
          await using query = await beginTransaction()
          recordPublisherTypeFeedPublicationWork(query, [rolledBack])
        }
        await using query = await beginTransaction()
        await expect(
          withTransactionOptions({ client: query.client }, async nested => {
            recordPublisherTypeFeedPublicationWork(nested, [rejected])
            throw new Error('reject nested capture')
          }),
        ).rejects.toThrow('reject nested capture')
        const beforeCommit = await capturePublisherFeedPublicationJobs([committed], async () => {
          await withTransactionOptions({ client: query.client }, async nested => {
            await recordPostTopicRelationPublicationChanges(
              nested,
              'relation__topic__publisher_type__topic',
              [{ subject_id: committed, object_id: randomUUID() }],
            )
          })
        })
        expect(beforeCommit).toEqual([])
        await query.commit()
      },
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      topicIds: [committed],
      afterTopicId: null,
    })
  })

  it('admits one snapshot root beyond the page size and preserves distinct mutation identities', async () => {
    const topicIds = Array.from({ length: 3 }, () => randomUUID()).toSorted()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
    )
    const capture = () =>
      capturePublisherFeedPublicationJobs(topicIds, async () => {
        await using query = await beginTransaction()
        await recordPostTopicRelationPublicationChanges(
          query,
          'relation__topic__publisher_type__topic',
          topicIds.map(subject_id => ({ subject_id, object_id: randomUUID() })),
        )
        await query.commit()
      })
    const first = await capture()
    const second = await capture()
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first[0]!.topicIds).toEqual(topicIds)
    expect(second[0]!.topicIds).toEqual(topicIds)
    expect(first[0]!.changeId).not.toBe(second[0]!.changeId)
  })
})

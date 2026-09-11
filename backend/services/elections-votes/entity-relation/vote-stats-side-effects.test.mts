import { describe, expect, it, vi } from 'vitest'
import { createEntityRelationElectionTarget } from './target.mts'
import {
  enqueuePostNotificationReconciliationIfUpdated,
  enqueueTopHashtagRefreshIfUpdated,
} from './vote-stats.mts'

describe('enqueueTopHashtagRefreshIfUpdated', () => {
  it.each([
    'relation__post__category__topic_alias',
    'relation__rss_feed_item__category__topic_alias',
  ])('enqueues after updating %s vote stats', relationTable => {
    const enqueue = vi.fn<() => void>()

    enqueueTopHashtagRefreshIfUpdated(
      createEntityRelationElectionTarget('relation-1', relationTable),
      true,
      enqueue,
    )

    expect(enqueue).toHaveBeenCalledOnce()
  })

  it('does not enqueue when persisted vote stats did not change', () => {
    const enqueue = vi.fn<() => void>()

    enqueueTopHashtagRefreshIfUpdated(
      createEntityRelationElectionTarget('relation-1', 'relation__post__category__topic_alias'),
      false,
      enqueue,
    )

    expect(enqueue).not.toHaveBeenCalled()
  })

  it('does not enqueue for unrelated relation vote stats', () => {
    const enqueue = vi.fn<() => void>()

    enqueueTopHashtagRefreshIfUpdated(
      createEntityRelationElectionTarget('relation-1', 'relation__user__category__topic'),
      true,
      enqueue,
    )

    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe('enqueuePostNotificationReconciliationIfUpdated', () => {
  it('reconciles notifications for an updated direct post topic category', () => {
    const enqueue = vi.fn<(postId: string) => void>()

    enqueuePostNotificationReconciliationIfUpdated(
      createEntityRelationElectionTarget('relation-1', 'relation__post__category__topic'),
      'post-1',
      enqueue,
    )

    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('post-1')
  })

  it('reconciles notifications for an updated post hashtag category', () => {
    const enqueue = vi.fn<(postId: string) => void>()

    enqueuePostNotificationReconciliationIfUpdated(
      createEntityRelationElectionTarget('relation-1', 'relation__post__category__topic_alias'),
      'post-2',
      enqueue,
    )

    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('post-2')
  })

  it('does not reconcile when no relation score changed', () => {
    const enqueue = vi.fn<(postId: string) => void>()

    enqueuePostNotificationReconciliationIfUpdated(
      createEntityRelationElectionTarget('relation-1', 'relation__post__category__topic'),
      undefined,
      enqueue,
    )

    expect(enqueue).not.toHaveBeenCalled()
  })
})

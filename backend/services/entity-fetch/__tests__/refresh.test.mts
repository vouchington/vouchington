import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { caches } from '@services/entity-cache/caches'
import { refresh } from '../refresh.mts'

describe('entity metrics refresh database failure', () => {
  it('reports and rethrows the database error without replacing cached metrics', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    await refresh.post_metrics(post.id)
    const before = await caches.post_metrics.get(post.id)
    expect(before).toMatchObject({ id: post.id })

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getPostMetricsByAny */',
      () => refresh.post_metrics(post.id).catch((err: unknown) => err),
    )

    expect(result).toBe(error)
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(await caches.post_metrics.get(post.id)).toEqual(before)

    await refresh.post_metrics(post.id)
    expect(await caches.post_metrics.get(post.id)).toMatchObject({ id: post.id })
  })
})

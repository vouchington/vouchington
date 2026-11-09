import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestReview } from '@voucha/test-helpers/entities/topics'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getTestLandingPageCount } from '@voucha/test-helpers/landing-page-count'
import { createMyLandingPage } from './create.mts'
import { deleteMyLandingPage } from './delete.mts'
import { replaceMyLandingPageItems } from './replace-items.mts'
import { getMyLandingPage } from './get.mts'
import { listLandingPagesForUser } from './list.mts'

describe('landing page write rollback', () => {
  it('leaves no page or occupied slot after a failed create', async () => {
    const user = await createTestUserDirect()
    await withPostgresQueryFailureForTest('/* createMyLandingPage */', () =>
      expect(
        createMyLandingPage(user.id, { title: 'Aborted', slug: 'aborted' }),
      ).rejects.toMatchObject({ code: '25P02' }),
    )
    expect(await listLandingPagesForUser(user.id)).toEqual([])
    const created = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    expect(created.is_default).toBe(true)
    expect(await getTestLandingPageCount(user.id)).toBe(1)
  })

  it('rolls back partial item replacement and propagates the database error', async () => {
    const user = await createTestUserDirect()
    const page = await createMyLandingPage(user.id, { title: 'Owned', slug: 'owned' })
    const reviews = await Promise.all(
      Array.from({ length: 2 }, () => insertTestReview({ userId: user.id, topicRatings: [] })),
    )
    const before = await replaceMyLandingPageItems(user.id, page.id, [
      { type: 'review', review_post_id: reviews[0]! },
    ])
    await withPostgresQueryFailureForTest('/* replaceMyLandingPageItems:deleteSurplus */', () =>
      expect(
        replaceMyLandingPageItems(user.id, page.id, [
          { type: 'review', review_post_id: reviews[1]! },
        ]),
      ).rejects.toMatchObject({ code: '25P02' }),
    )
    expect((await getMyLandingPage(user.id, page.id)).items).toEqual(before.items)
  })

  it('rolls back deletion and promotion together without retrying', async () => {
    const user = await createTestUserDirect()
    const first = await createMyLandingPage(user.id, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(user.id, { title: 'Second', slug: 'second' })
    await withPostgresQueryFailureForTest(
      '/* promoteOldestRemainingLandingPage */',
      () => expect(deleteMyLandingPage(user.id, first.id)).rejects.toMatchObject({ code: '25P02' }),
      { command: 'UPDATE' },
    )
    expect(await listLandingPagesForUser(user.id)).toMatchObject([
      { id: first.id, is_default: true },
      { id: second.id, is_default: false },
    ])
  })
})

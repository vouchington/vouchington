import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  completeCopyrightRestrictionHumanReview,
  countCopyrightActiveRestrictionsAtPlacement,
  createCopyrightNoticeSchemaFixture,
  createSecondCopyrightRestrictionForPlacement,
  eraseCopyrightSchemaActor,
  readCopyrightActionIntentRevision,
  readCopyrightErasedRestrictionActors,
  rejectCopyrightActionIntentDeletion,
  rejectCopyrightFinalReviewWithoutHuman,
  rejectCopyrightRestrictionDeletion,
  rejectCopyrightSubmissionMutation,
  type CopyrightNoticeSchemaFixture,
} from '../../../test-helpers/data-stores/psql/copyright-notice-schema.mts'
import { onGracefulShutdown } from '../index.mts'

let fixture: CopyrightNoticeSchemaFixture

describe('copyright notice schema', () => {
  beforeAll(async () => {
    fixture = await createCopyrightNoticeSchemaFixture()
  })

  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('requires an identified human for final review', async () => {
    await expect(rejectCopyrightFinalReviewWithoutHuman(fixture)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('allows user erasure without losing completed legal actions', async () => {
    await completeCopyrightRestrictionHumanReview(fixture)
    await eraseCopyrightSchemaActor(fixture)

    await expect(readCopyrightErasedRestrictionActors(fixture)).resolves.toEqual([
      expect.objectContaining({
        human_reviewed_at: expect.any(Date),
        human_reviewed_by_id: null,
        imposed_by_id: null,
      }),
    ])
  })

  it('keeps received submissions immutable', async () => {
    await expect(rejectCopyrightSubmissionMutation(fixture)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('prevents deleting an active restriction or its action-intent audit', async () => {
    await expect(rejectCopyrightRestrictionDeletion(fixture)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(rejectCopyrightActionIntentDeletion(fixture)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('allows independent notices to restrict the same placement', async () => {
    await createSecondCopyrightRestrictionForPlacement(fixture)
    await expect(countCopyrightActiveRestrictionsAtPlacement(fixture)).resolves.toBe(2)
  })

  it('retains the expected placement revision on the action intent', async () => {
    await expect(readCopyrightActionIntentRevision(fixture)).resolves.toBe(1)
  })
})

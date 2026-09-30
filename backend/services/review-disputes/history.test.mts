import { describe, expect, it } from 'vitest'
import {
  createStaffResolutionFixture,
  readStaffResolutionState,
  readStaffDraftHistory,
} from '@voucha/test-helpers/staff-resolution-history'
import { withRejectedStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { searchModeratorActions } from '@services/moderator-actions'
import { resolveReviewDisputeRemove, resolveReviewDisputeAnnotate } from './resolve.mts'
import { dismissReviewDispute } from './dismiss-dispute.mts'
import { updateReviewDisputeDraft as updateDraft } from './update-dispute-draft.mts'

const resolutions = [
  { name: 'remove', run: resolveReviewDisputeRemove, action: 'resolve_report' },
  {
    name: 'annotate',
    run: (actor: string, id: string) => resolveReviewDisputeAnnotate(actor, id, 'Staff annotation'),
    action: 'resolve_report',
  },
  { name: 'dismiss', run: dismissReviewDispute, action: 'dismiss_report' },
] as const

it.each(resolutions)('$name records history with the resolution', async ({ run, action }) => {
  const { actorId, id } = await createStaffResolutionFixture('dispute')
  await run(actorId, id)
  expect((await readStaffResolutionState('dispute', id)).resolved_at).not.toBeNull()
  expect((await searchModeratorActions({ actorId })).results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action_type: action, review_dispute_id: id }),
    ]),
  )
})

it.each(resolutions)('$name rolls back when audit insertion fails', async ({ run }) => {
  const { actorId, id } = await createStaffResolutionFixture('dispute')
  const before = await readStaffResolutionState('dispute', id)
  await expect(
    withRejectedStaffActionHistory(actorId, async () => {
      await run(actorId, id)
    }),
  ).rejects.toThrow('staff history rejected')
  expect(await readStaffResolutionState('dispute', id)).toEqual(before)
  expect((await searchModeratorActions({ actorId })).results).toEqual([])
})

describe('review-disputes staff history', () => {
  it('draft history retains replaced text', async () => {
    const { actorId, id } = await createStaffResolutionFixture('dispute', false)
    await updateDraft(actorId, id, {
      publicResponse: 'Original response',
      internalNotes: 'Original note',
    })
    await updateDraft(actorId, id, { publicResponse: 'Revised response' })
    expect(await readStaffDraftHistory('dispute', id)).toEqual({
      before: { public_response: 'Original response', internal_notes: 'Original note' },
      after: { public_response: 'Revised response', internal_notes: 'Original note' },
    })
  })
})

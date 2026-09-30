import { describe, expect, it } from 'vitest'
import {
  createStaffResolutionFixture,
  readStaffResolutionState,
  readStaffDraftHistory,
} from '@voucha/test-helpers/staff-resolution-history'
import { withRejectedStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { searchModeratorActions } from '@services/moderator-actions'
import { resolveModerationAppealAccept, resolveModerationAppealReduce } from './resolve.mts'
import { dismissModerationAppeal } from './dismiss-appeal.mts'
import { updateModerationAppealDraft as updateDraft } from './update-appeal-draft.mts'

const resolutions = [
  { name: 'accept', run: resolveModerationAppealAccept, action: 'resolve_appeal' },
  { name: 'reduce', run: resolveModerationAppealReduce, action: 'resolve_appeal' },
  { name: 'dismiss', run: dismissModerationAppeal, action: 'dismiss_appeal' },
] as const

it.each(resolutions)('$name records history with the resolution', async ({ run, action }) => {
  const { actorId, id } = await createStaffResolutionFixture('appeal')
  await run(actorId, id)
  expect((await readStaffResolutionState('appeal', id)).resolved_at).not.toBeNull()
  expect((await searchModeratorActions({ actorId })).results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action_type: action, moderation_appeal_id: id }),
    ]),
  )
})

it.each(resolutions)('$name rolls back when audit insertion fails', async ({ run }) => {
  const { actorId, id } = await createStaffResolutionFixture('appeal')
  const before = await readStaffResolutionState('appeal', id)
  await expect(
    withRejectedStaffActionHistory(actorId, async () => {
      await run(actorId, id)
    }),
  ).rejects.toThrow('staff history rejected')
  expect(await readStaffResolutionState('appeal', id)).toEqual(before)
  expect((await searchModeratorActions({ actorId })).results).toEqual([])
})

describe('moderation-appeals staff history', () => {
  it('draft history retains replaced text', async () => {
    const { actorId, id } = await createStaffResolutionFixture('appeal', false)
    await updateDraft(actorId, id, {
      publicResponse: 'Original response',
      internalNotes: 'Original note',
    })
    await updateDraft(actorId, id, { publicResponse: 'Revised response' })
    expect(await readStaffDraftHistory('appeal', id)).toEqual({
      before: { public_response: 'Original response', internal_notes: 'Original note' },
      after: { public_response: 'Revised response', internal_notes: 'Original note' },
    })
  })
})

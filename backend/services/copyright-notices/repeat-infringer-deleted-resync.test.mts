import { describe, expect, it } from 'vitest'
import { readTestRepeatInfringerIncidents } from '@voucha/test-helpers/copyright-repeat-infringer'
import {
  createRetainedRepeatScene,
  retainedRepeatAppealDecision,
} from '@voucha/test-helpers/copyright-retained-repeat-scenes'
import {
  seedEffectiveAppealDecision,
  seedEffectiveConfirmation,
} from '@voucha/test-helpers/copyright-effective-review-decisions'
import {
  assertEffectiveAppeal,
  assertEffectiveConfirmation,
} from '@voucha/test-helpers/copyright-effective-review-subjects'
import { readEffectiveReviewState } from '@voucha/test-helpers/copyright-effective-review-state'

describe('deleted-account repeat-infringer resynchronization', () => {
  it.each([
    ['confirm', true],
    ['reverse', false],
  ] as const)(
    'keeps the retained incident until a real reversal: %s',
    async (action, expectedOperative) => {
      const actual = await createRetainedRepeatScene()
      await assertEffectiveAppeal(
        actual.fixture,
        actual.poster,
        actual.moderator,
        action,
        { [actual.poster.id]: expectedOperative },
        0,
        actual.appeal.submission.id,
      )
      // An independent committed review always reaches the retained-incident consumer.
      const committed = await createRetainedRepeatScene()
      await seedEffectiveAppealDecision(
        retainedRepeatAppealDecision(committed, action),
        committed.fixture.noticeId,
      )
      expect(await readTestRepeatInfringerIncidents(committed.poster.id)).toEqual([
        expect.objectContaining({
          copyright_notice_id: committed.fixture.noticeId,
          is_operative: expectedOperative,
        }),
      ])
    },
  )

  it('keeps a later-confirmed target after deletion when an earlier target is reversed', async () => {
    const confirmation = await createRetainedRepeatScene(2)
    await assertEffectiveConfirmation(
      confirmation.fixture,
      confirmation.poster,
      confirmation.moderator,
      { [confirmation.poster.id]: true },
      1,
    )
    // The appeal subject owns a separate complete later confirmation, even if the first actor aborted.
    const actual = await createRetainedRepeatScene(2)
    await seedEffectiveConfirmation(
      actual.fixture.noticeId,
      actual.fixture.restrictions[1]!.id,
      actual.moderator,
    )
    await assertEffectiveAppeal(
      actual.fixture,
      actual.poster,
      actual.moderator,
      'reverse',
      { [actual.poster.id]: true },
      0,
      actual.appeal.submission.id,
    )
    // This positive retained-target projection never depends on an SSI actor succeeding.
    const committed = await createRetainedRepeatScene(2)
    await seedEffectiveConfirmation(
      committed.fixture.noticeId,
      committed.fixture.restrictions[1]!.id,
      committed.moderator,
    )
    await seedEffectiveAppealDecision(
      retainedRepeatAppealDecision(committed, 'reverse'),
      committed.fixture.noticeId,
    )
    expect(await readTestRepeatInfringerIncidents(committed.poster.id)).toEqual([
      expect.objectContaining({
        copyright_notice_id: committed.fixture.noticeId,
        is_operative: true,
      }),
    ])
    const state = await readEffectiveReviewState(committed.fixture.noticeId, [committed.poster.id])
    expect(state.provenance).toEqual(
      committed.fixture.restrictions
        .map(row => ({
          account: committed.poster.id,
          target: row.targetId,
        }))
        .toSorted((a, b) => a.target.localeCompare(b.target)),
    )
    expect(state.accounts[0]!.live).toBe(false)
    expect(state.accounts[0]!.open).toEqual([])
  })
})

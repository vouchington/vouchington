import { describe, expect, it } from 'vitest'
import {
  createTestEuParticipantCase,
  createTestEuParticipantComplaint,
} from '@voucha/test-helpers/copyright-eu-participant-cases'
import {
  clearTerritorialDecisionPredecessorWithScope,
  readTerritorialDecisionPredecessors,
  runTerritorialDecisionPointerCut,
} from '@voucha/test-helpers/services/copyright-notices/territorial-decision-pointer-cut'
import { recordEuCopyrightStatementOfReasons } from './index.mts'

describe('territorial decision predecessor purge', () => {
  it('cuts a successor link only under the matching case and table permit', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    await createTestEuParticipantComplaint({
      noticeId,
      actor: scene.notifier,
      staff: scene.staff,
      explanation: 'Please review the no-action decision.',
      rationale: 'The notice deserves a new review.',
      disposition: 'revoke',
    })
    await recordEuCopyrightStatementOfReasons(scene.staff, noticeId, {
      text: 'The hosted post reproduces the notified photograph.',
      publicExplanation: 'The image matches the notified photograph.',
      outcome: 'restrict',
      targets: [
        {
          surfaceKind: 'post-image',
          postId: scene.postId,
          imageId: scene.imageId,
          hostedUseUrl: `https://example.test/work/${scene.suffix}`,
        },
      ],
    })

    const [predecessor, successor] = await readTerritorialDecisionPredecessors(noticeId)
    if (!predecessor || !successor) throw new Error('Missing territorial decision history')
    expect(predecessor.supersedes_decision_id).toBeNull()
    expect(successor.supersedes_decision_id).toBe(predecessor.id)

    await expect(
      clearTerritorialDecisionPredecessorWithScope(successor.id, noticeId, null),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      clearTerritorialDecisionPredecessorWithScope(
        successor.id,
        scene.staff.id,
        'copyright_territorial_decisions',
      ),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(runTerritorialDecisionPointerCut(noticeId)).resolves.toEqual({
      nextPhaseIndex: 1,
      cut: 1,
      nextAfterId: null,
    })
    expect(await readTerritorialDecisionPredecessors(noticeId)).toEqual([
      predecessor,
      { id: successor.id, supersedes_decision_id: null },
    ])
  })
})

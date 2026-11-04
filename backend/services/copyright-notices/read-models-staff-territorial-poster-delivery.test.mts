import { describe, expect, it } from 'vitest'
import { createTestEuParticipantCase } from '@voucha/test-helpers/copyright-eu-participant-cases'
import { setTestPosterTargetDeliveryOutcome } from '@voucha/test-helpers/copyright-target-delivery-outcome'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { listCopyrightTerritorialPosters } from './index.mts'

describe('territorial poster delivery', () => {
  useCopyrightIntakeEnvironment()

  it('reports delivery for each target of a poster on two targets', async () => {
    const scene = await createTestEuParticipantCase('restrict', {
      extraPosts: 1,
      samePoster: true,
    })
    const noticeId = scene.receipt.notice_id
    const before = await listCopyrightTerritorialPosters(scene.staff, noticeId, { limit: 5 })
    expect(before.results.map(row => row.user_id)).toEqual([scene.poster.id, scene.poster.id])
    const [failedTarget, sentTarget] = before.results.map(row => row.target_id) as [string, string]
    const outcome = (targetId: string, state: 'sent' | 'failed') =>
      setTestPosterTargetDeliveryOutcome({
        noticeId,
        targetId,
        userId: scene.poster.id,
        outcome: state,
      })
    await outcome(failedTarget, 'failed')
    await outcome(sentTarget, 'sent')

    const after = await listCopyrightTerritorialPosters(scene.staff, noticeId, { limit: 5 })
    expect(after.results.map(row => [row.target_id, row.state, row.informed_at !== null])).toEqual([
      [failedTarget, 'failed', false],
      [sentTarget, 'sent', true],
    ])
  })
})

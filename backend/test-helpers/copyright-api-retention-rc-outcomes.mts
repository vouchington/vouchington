import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import { readCopyrightApiRetentionState } from './copyright-api-preservation-outcome.mts'

/** Ordinary closure/resolution transactions must commit strictly; their exact replay writes nothing. */
export async function assertCopyrightApiRetentionClosure(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  childId: string
  reviewerId: string
  kind: 'escalation' | 'complaint'
}) {
  const before = await readCopyrightApiRetentionState(input.noticeId)
  const escalation = input.kind === 'escalation'
  const url = `/api/v1/copyright-notices/${input.noticeId}/${escalation ? 'escalations' : 'supervised-complaints'}/${input.childId}/${escalation ? 'closures' : 'resolutions'}`
  const response = await input.staff.post(url).expect(201)
  const after = await readCopyrightApiRetentionState(input.noticeId)
  expect(after).toEqual({
    ...before,
    clock: { ...before.clock, at: expect.any(Date) },
    escalations: before.escalations.map(row =>
      escalation && row.id === input.childId
        ? { ...row, closed_at: expect.any(Date), closed_by_id: input.reviewerId }
        : row,
    ),
    complaints: before.complaints.map(row =>
      !escalation && row.id === input.childId
        ? { ...row, resolved_at: expect.any(Date), resolved_by_id: input.reviewerId }
        : row,
    ),
  })
  const { rows } = await write<{ at: Date | null }>(
    escalation
      ? sql`/* readApiEscalationCompletion */ SELECT closed_at AS at FROM copyright_territorial_escalations
        WHERE id = ${input.childId} AND copyright_notice_id = ${input.noticeId}`
      : sql`/* readApiComplaintCompletion */ SELECT resolved_at AS at FROM copyright_eu_supervised_complaints
        WHERE id = ${input.childId} AND copyright_notice_id = ${input.noticeId}`,
  )
  const completedAt = rows[0]?.at
  if (!completedAt) throw new Error('Owned retention action did not record its completion instant')
  expect(response.body).toEqual(
    escalation
      ? { copyright_territorial_escalation_closure: { closed_at: completedAt.toISOString() } }
      : {
          copyright_eu_supervised_complaint_resolution: { resolved_at: completedAt.toISOString() },
        },
  )
  const replay = await input.staff.post(url).expect(201)
  expect(replay.body).toEqual(response.body)
  expect(await readCopyrightApiRetentionState(input.noticeId)).toEqual(after)
}

/** Releasing one owned hold neither changes overlapping holds nor permits a second release. */
export async function assertCopyrightApiPreservationRelease(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  holdId: string
  reviewerId: string
}) {
  const before = await readCopyrightApiRetentionState(input.noticeId)
  const url = `/api/v1/copyright-notices/${input.noticeId}/preservation-holds/${input.holdId}/releases`
  const response = await input.staff.post(url).expect(201)
  const after = await readCopyrightApiRetentionState(input.noticeId)
  expect(after).toEqual({
    ...before,
    clock: { ...before.clock, at: expect.any(Date) },
    holds: before.holds.map(row =>
      row.id === input.holdId
        ? { ...row, released: expect.any(Date), releaser: input.reviewerId }
        : row,
    ),
  })
  expect(response.body).toEqual({
    copyright_case_preservation_hold_release: {
      released_at: after.holds.find(row => row.id === input.holdId)!.released!.toISOString(),
    },
  })
  const replay = await input.staff.post(url).expect(409)
  expect(replay.body.message).toBe('Copyright preservation hold is absent or already released')
  expect(await readCopyrightApiRetentionState(input.noticeId)).toEqual(after)
}

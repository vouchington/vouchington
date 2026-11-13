import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { createRequest } from './api/server.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

export async function readCopyrightApiRetentionState(noticeId: string) {
  const [
    aggregate,
    { rows: holds },
    { rows: clocks },
    { rows: complaints },
    { rows: escalations },
  ] = await Promise.all([
    getCopyrightNoticePrivateAggregate(noticeId),
    write<{
      id: string
      notice: string
      kind: string
      actor: string
      placed: Date
      released: Date | null
      releaser: string | null
    }>(sql`/* readApiPreservation:holds */
      SELECT id, copyright_notice_id AS notice, kind, placed_by_id AS actor, created_at AS placed,
        released_at AS released, released_by_id AS releaser FROM copyright_case_preservation_holds
      WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
    write<{ erased: Date | null; at: Date }>(sql`/* readApiPreservation:clock */
      SELECT evidence_erased_at AS erased, last_legal_activity_at AS at FROM copyright_notices WHERE id = ${noticeId}`),
    write(
      sql`/* readApiPreservation:complaints */ SELECT * FROM copyright_eu_supervised_complaints WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
    ),
    write(
      sql`/* readApiPreservation:escalations */ SELECT * FROM copyright_territorial_escalations WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
    ),
  ])
  if (!aggregate || !clocks[0]) throw new Error('Owned preservation case disappeared')
  return { aggregate, holds, clock: clocks[0], complaints, escalations }
}

/** Placement alone is SERIALIZABLE; its exact mapped conflict must leave every case fact unchanged. */
export async function assertCopyrightApiPreservationPlacement(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  reviewerId: string
  kind: 'litigation_threat' | 'regulator_request' | 'court_request'
}) {
  const before = await readCopyrightApiRetentionState(input.noticeId)
  const response = await input.staff
    .post(`/api/v1/copyright-notices/${input.noticeId}/preservation-holds`)
    .send({ kind: input.kind })
  const after = await readCopyrightApiRetentionState(input.noticeId)
  const id = after.holds.find(row => !before.holds.some(prior => prior.id === row.id))?.id
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case preservation hold',
      hold: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      hold: { id },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        holds: [
          ...before.holds,
          {
            id,
            notice: input.noticeId,
            kind: input.kind,
            actor: input.reviewerId,
            placed: expect.any(Date),
            released: null,
            releaser: null,
          },
        ],
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    hold: response.body.copyright_case_preservation_hold,
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}

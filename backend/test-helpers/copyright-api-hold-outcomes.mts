import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { createRequest } from './api/server.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightLateHoldBindings } from './copyright-restoration-hold-scene.mts'

async function readApiHoldState(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Owned API hold case disappeared')
  const { rows } = await write<{ at: Date }>(sql`/* readApiHoldState:clock */
    SELECT last_legal_activity_at AS at FROM copyright_notices WHERE id = ${noticeId}`)
  return { aggregate, bindings: await readCopyrightLateHoldBindings(noticeId), clock: rows[0]!.at }
}

/** Current active unlifted authority means this assessment cannot create a late-hold restriction. */
export async function assertCopyrightApiHoldAssessment(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  submissionId: string
  reviewerId: string
  body: {
    rationale: string
    is_from_original_claimant: boolean
    is_same_material: boolean
    proceeding_kind: string
    ccb_claim_kind: string
    commenced_at: string
    received_by_designated_agent_at: string
    target_ids: string[]
  }
}) {
  const before = await readApiHoldState(input.noticeId)
  const response = await input.staff
    .post(`/api/v1/copyright-submissions/${input.submissionId}/legal-hold-assessments`)
    .send(input.body)
  const after = await readApiHoldState(input.noticeId)
  const id = after.aggregate.holdAssessments.find(
    row => row.copyright_notice_submission_id === input.submissionId,
  )?.id
  const hold = expect.objectContaining({
    id,
    copyright_notice_submission_id: input.submissionId,
    assessed_at: expect.any(Date),
    assessed_by_id: input.reviewerId,
    is_from_original_claimant: input.body.is_from_original_claimant,
    is_same_material: input.body.is_same_material,
    proceeding_kind: input.body.proceeding_kind,
    ccb_claim_kind: input.body.ccb_claim_kind,
    commenced_at: new Date(input.body.commenced_at),
    received_by_designated_agent_at: new Date(input.body.received_by_designated_agent_at),
    rationale_ciphertext: expect.any(String),
    target_ids: input.body.target_ids,
  })
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      hold: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      hold: expect.objectContaining({
        id,
        copyright_notice_submission_id: input.submissionId,
        target_ids: input.body.target_ids,
        assessed_by_id: input.reviewerId,
      }),
      state: {
        ...before,
        clock: expect.any(Date),
        aggregate: {
          ...before.aggregate,
          holdAssessments: [...before.aggregate.holdAssessments, hold],
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: input.noticeId,
              change_type: 'legal_hold_assessed',
              changed_by_id: input.reviewerId,
              copyright_notice_legal_hold_assessment_id: id,
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    hold: response.body.copyright_legal_hold_assessment,
    state: after,
  })
  expect(after.clock.getTime()).toBeGreaterThanOrEqual(before.clock.getTime())
}

/** Resolving an ordinary hold commits its record and audit together, without late-bound restores. */
export async function assertCopyrightApiHoldResolution(input: {
  staff: ReturnType<typeof createRequest>
  noticeId: string
  assessmentId: string
  reviewerId: string
  body: { resolution_kind: string; rationale: string }
}) {
  const before = await readApiHoldState(input.noticeId)
  expect(before.bindings).toEqual([])
  const response = await input.staff
    .post(`/api/v1/copyright-legal-hold-assessments/${input.assessmentId}/resolutions`)
    .send(input.body)
  const after = await readApiHoldState(input.noticeId)
  const id = after.aggregate.holdResolutions[0]?.id
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      resolution: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      resolution: expect.objectContaining({
        id,
        copyright_notice_legal_hold_assessment_id: input.assessmentId,
        resolution_kind: input.body.resolution_kind,
        resolved_by_id: input.reviewerId,
      }),
      state: {
        ...before,
        clock: expect.any(Date),
        aggregate: {
          ...before.aggregate,
          holdResolutions: [
            expect.objectContaining({
              id,
              copyright_notice_legal_hold_assessment_id: input.assessmentId,
              resolution_kind: input.body.resolution_kind,
              resolved_by_id: input.reviewerId,
              resolved_at: expect.any(Date),
              rationale_ciphertext: expect.any(String),
            }),
          ],
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: input.noticeId,
              change_type: 'legal_hold_resolved',
              changed_by_id: input.reviewerId,
              copyright_notice_legal_hold_resolution_id: id,
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    resolution: response.body.copyright_legal_hold_resolution,
    state: after,
  })
  expect(after.clock.getTime()).toBeGreaterThanOrEqual(before.clock.getTime())
}

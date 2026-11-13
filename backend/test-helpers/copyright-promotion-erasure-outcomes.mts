import { expect } from 'vitest'
import { readCopyrightEmailPromotionEffects } from './copyright-email-intake-fixtures.mts'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'
import { readCopyrightEmailReceiptErasedAt } from './copyright-email-retention-state.mts'
import type { CopyrightOperationalScope } from '../services/copyright-notices/operational-retention-cursor.mts'

/** Compare committed admission stages with erasure, rather than assuming a fixed SSI winner. */
export async function assertCopyrightPromotionErasureOutcome(input: {
  intakeId: string
  placementId: string
  scope: CopyrightOperationalScope
  erasure: { scanned: number; erased: number; hasMore: boolean }
  promotion: unknown
}) {
  const links = await readCopyrightEmailIntakeNoticeLinks(input.intakeId)
  const noticeId = links[0]?.copyright_notice_id
  const effects = await readCopyrightEmailPromotionEffects(input.intakeId, input.placementId)
  const conflict = expect.objectContaining({
    status: 'rejected',
    error: expect.objectContaining({
      status: 409,
      code: 'copyright_email_thread_changed',
      cause: expect.objectContaining({ code: '40001' }),
    }),
  })
  const success = expect.objectContaining({
    status: 'fulfilled',
    value: expect.objectContaining({ noticeId, submissionId: expect.any(String) }),
  })
  const admitted = {
    links: [{ copyright_notice_id: noticeId, link_kind: 'initial' }],
    effects: { reviews: 1, evidence: 1, deliveries: 0, thread_reviews: 0, notice_targets: 1 },
    erased: false,
  }
  const empty = {
    links: [],
    effects: { reviews: 0, evidence: 0, deliveries: 0, thread_reviews: 0, notice_targets: 0 },
  }
  const noProgress = { scanned: 0, erased: 0, hasMore: false }
  const skipped = { scanned: 1, erased: 0, hasMore: true }
  const retired = { scanned: 1, erased: 1, hasMore: true }
  expect([
    { promotion: success, erasure: noProgress, ...admitted },
    { promotion: success, erasure: skipped, ...admitted },
    // Admission commits before assessment/enforcement, so a later SSI error retains that stage.
    { promotion: conflict, erasure: noProgress, ...admitted },
    { promotion: conflict, erasure: skipped, ...admitted },
    { promotion: conflict, erasure: noProgress, erased: false, ...empty },
    { promotion: conflict, erasure: retired, erased: true, ...empty },
  ]).toContainEqual({
    promotion: input.promotion,
    erasure: input.erasure,
    links,
    effects,
    erased: (await readCopyrightEmailReceiptErasedAt(input.intakeId)) !== null,
  })
  expect(input.scope.cursor).toMatchObject(
    input.erasure.scanned === 0
      ? {
          cursor_record_id: null,
          sweep_upper_bound_record_id: null,
          cursor_phase: null,
          cursor_edge_id: null,
        }
      : {
          cursor_record_id: input.erasure.erased ? null : input.intakeId,
          sweep_upper_bound_record_id: expect.any(String),
          cursor_phase: null,
          cursor_edge_id: null,
        },
  )
}

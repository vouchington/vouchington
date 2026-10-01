import { afterAll, describe, expect, it } from 'vitest'
import {
  rejectEscalationForAnotherNoticesAcknowledgment,
  rejectEscalationWithSources,
  rejectEuComplaintForUkNotice,
  rejectEuReceiptForUkNotice,
  rejectEuReceiptWithUkApproval,
  rejectRedressForAnotherNoticesDecision,
  rejectUkDecisionForEuNotice,
} from '../../../test-helpers/data-stores/psql/copyright-territorial-constraints.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright territorial table constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects a receipt recorded under another notice jurisdiction', async () => {
    await expect(rejectEuReceiptForUkNotice()).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_copyright_territorial_notice_receipts__notice',
    })
  })

  it('rejects a receipt that cites another jurisdiction policy approval', async () => {
    await expect(rejectEuReceiptWithUkApproval()).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_copyright_territorial_notice_receipts__approval',
    })
  })

  it('rejects a child row of a wrong-jurisdiction notice', async () => {
    await expect(rejectUkDecisionForEuNotice()).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_copyright_territorial_decisions__notice',
    })
    await expect(rejectEuComplaintForUkNotice()).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_copyright_eu_supervised_complaints__notice',
    })
  })

  it('rejects a redress request that cites another notice decision', async () => {
    await expect(rejectRedressForAnotherNoticesDecision()).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_copyright_territorial_redress_requests__decision',
    })
  })

  it('rejects an escalation with zero or two sources', async () => {
    for (const sources of ['none', 'both'] as const) {
      await expect(rejectEscalationWithSources(sources)).rejects.toMatchObject({
        code: '23514',
        constraint: 'chk_copyright_territorial_escalations__source',
      })
    }
  })

  it('rejects an escalation that cites another notice acknowledgment', async () => {
    await expect(rejectEscalationForAnotherNoticesAcknowledgment()).rejects.toMatchObject({
      code: '23514',
      message: 'territorial escalation source belongs to another notice',
    })
  })
})

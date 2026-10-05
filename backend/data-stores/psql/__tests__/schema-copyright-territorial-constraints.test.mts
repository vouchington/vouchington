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
import {
  probeTerritorialDecisionAssessment,
  probeTerritorialDecisionSuccessor,
  readTerritorialPredecessorConstraint,
} from '@voucha/test-helpers/copyright-territorial-decision-constraints'
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

  it.each(['eu_dsa', 'uk'] as const)(
    'accepts a %s restriction with a current compliant human notice assessment',
    async jurisdiction => {
      await expect(
        probeTerritorialDecisionAssessment('valid_restrict', jurisdiction),
      ).resolves.toBeUndefined()
    },
  )

  it('rejects an invalid outcome through the enum domain', async () => {
    await expect(probeTerritorialDecisionAssessment('invalid_outcome')).rejects.toMatchObject({
      code: '22P02',
    })
  })

  it.each([
    ['no_action_with_assessment', 'chk_copyright_territorial_decisions__assessment'],
    ['empty_explanation', 'chk_copyright_territorial_decisions__public_explanation'],
    ['oversized_explanation', 'chk_copyright_territorial_decisions__public_explanation'],
  ] as const)('rejects %s at the decision table', async (scenario, constraint) => {
    await expect(probeTerritorialDecisionAssessment(scenario)).rejects.toMatchObject({
      code: '23514',
      constraint,
    })
  })

  it('rejects a restriction without a human notice assessment before table checks', async () => {
    await expect(
      probeTerritorialDecisionAssessment('restrict_without_assessment'),
    ).rejects.toMatchObject({
      code: '23514',
      message:
        'territorial restriction requires a current compliant human notice assessment in the same case',
    })
  })

  it('requires a public explanation on every decision', async () => {
    await expect(probeTerritorialDecisionAssessment('missing_explanation')).rejects.toMatchObject({
      code: '23502',
      column: 'public_explanation_ciphertext',
    })
  })

  it.each(['foreign_assessment', 'noncompliant_assessment'] as const)(
    'rejects a restriction backed by a %s',
    async scenario => {
      await expect(probeTerritorialDecisionAssessment(scenario)).rejects.toMatchObject({
        code: '23514',
        message:
          'territorial restriction requires a current compliant human notice assessment in the same case',
      })
    },
  )

  it('cannot construct automated territorial authority without a completed US screen', async () => {
    await expect(probeTerritorialDecisionAssessment('automated_assessment')).rejects.toMatchObject({
      code: '23514',
      message:
        'automated copyright assessment requires its current completed screen and complete structured US DMCA notice',
    })
  })

  it('keeps predecessor decisions within the same notice by foreign key', async () => {
    await expect(readTerritorialPredecessorConstraint()).resolves.toContain(
      'FOREIGN KEY (copyright_notice_id, supersedes_decision_id)',
    )
    await expect(probeTerritorialDecisionSuccessor('foreign_predecessor')).rejects.toMatchObject({
      code: '23514',
      message: 'territorial successor requires a revoked no_action decision',
    })
  })

  it.each(['no_revoke', 'restrict_predecessor'] as const)(
    'rejects a successor after %s',
    async scenario => {
      await expect(probeTerritorialDecisionSuccessor(scenario)).rejects.toMatchObject({
        code: '23514',
        message: 'territorial successor requires a revoked no_action decision',
      })
    },
  )

  it('accepts a restricted successor after a no-action decision is revoked', async () => {
    await expect(probeTerritorialDecisionSuccessor('valid_revoke')).resolves.toBeUndefined()
  })
})

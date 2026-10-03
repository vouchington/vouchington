import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestCopyrightStatementFacts } from '@voucha/test-helpers/services/copyright-notices/statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { buildCopyrightStatementOfReasons } from './statement-of-reasons.mts'

describe('statement public facts and durable provenance', () => {
  useCopyrightIntakeEnvironment()
  it('keeps a human assessment human after moderator erasure and excludes private inputs', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const notice = await createSignedInCopyrightForm()
    const privateRationale = `private-rationale-${crypto.randomUUID()}`
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      accepted: true,
      rationale: privateRationale,
    })
    const caseId = notice.intake.copyright_notice_id
    const restriction = (await getCopyrightNoticePrivateAggregate(caseId))!.restrictions[0]!
    await deleteTestUser(moderator.id)
    const facts = await readTestCopyrightStatementFacts(caseId, restriction.id)
    expect(facts.automatedDecision).toBe(false)
    expect(facts.aiGuidance).toBe(false)
    const statement = buildCopyrightStatementOfReasons({
      ...facts,
      audience: 'poster',
      event: 'restricted',
    })
    for (const privateValue of [
      privateRationale,
      moderator.id,
      'Claimant',
      'claimant@example.test',
      'Original photograph',
    ])
      expect(JSON.stringify(statement)).not.toContain(privateValue)
    expect(statement.text).toContain('A person made this decision')
  })
  it('requires an actual completed guidance result', async () => {
    const plain = await createSignedInCopyrightForm()
    const screened = await createClearScreenedForm()
    expect(
      (await readTestCopyrightStatementFacts(plain.intake.copyright_notice_id)).aiGuidance,
    ).toBe(false)
    expect(
      (await readTestCopyrightStatementFacts(screened.notice.intake.copyright_notice_id))
        .aiGuidance,
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { checkTestAutomaticWithholdingCaps } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { readTestAutomaticWithholdingOutcome } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import {
  createClearScreenedForm,
  type FormPeople,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { reviewCopyrightFormIntake } from './index.mts'

async function createForm(people: FormPeople = {}) {
  return (await createClearScreenedForm(1, people)).notice
}

function screen(notice: Awaited<ReturnType<typeof createForm>>) {
  return applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
}

const withheld = { refusal: null, assessments: 1, restrictions: 1 }
const refusedFor = (refusal: string) => ({ refusal, assessments: 0, restrictions: 0 })

describe('automatic withholding caps', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it('refuses a claimant past the daily cap and leaves the notice to a moderator', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: 1 })
    const claimant = await createTestUser()
    const [first, second] = [await createForm({ claimant }), await createForm({ claimant })]

    await screen(first)
    await screen(second)

    await expect(readTestAutomaticWithholdingOutcome(first)).resolves.toEqual(withheld)
    await expect(readTestAutomaticWithholdingOutcome(second)).resolves.toEqual(
      refusedFor('claimant_daily_cap'),
    )

    const moderator = { ...(await createTestUser()), roles: ['moderator'] }
    await reviewCopyrightFormIntake({
      intakeId: second.intake.id,
      currentUser: moderator as Awaited<ReturnType<typeof createTestUser>>,
      is_accepted: true,
      rationale: 'The over-cap notice is complete.',
    })
    await expect(readTestAutomaticWithholdingOutcome(second)).resolves.toMatchObject({
      refusal: 'claimant_daily_cap',
      restrictions: 1,
    })
  })

  it('refuses notices against one poster past the per-poster cap', async () => {
    await switchOn({ automaticWithholdingPosterDailyCap: 1 })
    const poster = await createTestUser()
    const [first, second] = [await createForm({ poster }), await createForm({ poster })]

    await screen(first)
    await screen(second)

    await expect(readTestAutomaticWithholdingOutcome(first)).resolves.toEqual(withheld)
    await expect(readTestAutomaticWithholdingOutcome(second)).resolves.toEqual(
      refusedFor('poster_daily_cap'),
    )
  })

  it.each([
    ['automaticWithholdingClaimantDailyCap', 'claimant_daily_cap'],
    ['automaticWithholdingPosterDailyCap', 'poster_daily_cap'],
  ])('refuses every notice when %s is zero', async (field, reason) => {
    await switchOn({ [field]: 0 })
    const notice = await createForm()

    await screen(notice)

    await expect(readTestAutomaticWithholdingOutcome(notice)).resolves.toEqual(refusedFor(reason))
  })

  it('admits exactly one of two concurrent notices at a cap of one', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: 1 })
    const claimant = await createTestUser()
    const notices = [await createForm({ claimant }), await createForm({ claimant })]

    await Promise.all(notices.map(screen))

    const outcomes = await Promise.all(notices.map(readTestAutomaticWithholdingOutcome))
    expect(outcomes.map(outcome => outcome.restrictions).toSorted()).toEqual([0, 1])
    expect(outcomes.map(outcome => outcome.refusal).toSorted()).toEqual([
      'claimant_daily_cap',
      null,
    ])
  })

  it('counts only automated assessments from the last 24 hours', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: 1 })
    const claimant = await createTestUser()
    const notice = await createForm({ claimant })
    await screen(notice)
    const next = await createForm({ claimant })
    const thresholds = { claimantDailyCap: 1, posterDailyCap: 1000 }
    const check = (now: Date) =>
      checkTestAutomaticWithholdingCaps({
        noticeId: next.intake.copyright_notice_id,
        claimantId: claimant.id,
        thresholds,
        now,
      })

    await expect(check(new Date())).resolves.toBe('claimant_daily_cap')
    await expect(check(new Date(Date.now() + 25 * 60 * 60 * 1000))).resolves.toBeNull()
  })
})

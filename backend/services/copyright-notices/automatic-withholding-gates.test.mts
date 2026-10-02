import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUserWithAge } from '@voucha/test-helpers'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { readTestAutomaticWithholdingOutcome } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import {
  createClearScreenedForm,
  type FormPeople,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { suspendUser } from '@services/users/suspension'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'

const DAY_MS = 24 * 60 * 60 * 1000

async function fileAndScreen(people: FormPeople = {}) {
  const { notice } = await createClearScreenedForm(1, people)
  await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
  return { notice, outcome: await readTestAutomaticWithholdingOutcome(notice) }
}

const withheld = { refusal: null, assessments: 1, restrictions: 1 }
const refusedFor = (refusal: string) => ({ refusal, assessments: 0, restrictions: 0 })

describe('automatic withholding gates', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it('records nothing while the switch is off, whatever the gates say', async () => {
    const { outcome } = await fileAndScreen()
    expect(outcome).toEqual({ refusal: null, assessments: 0, restrictions: 0 })
  })

  it('withholds when every approved gate passes', async () => {
    await switchOn()
    const { outcome } = await fileAndScreen()
    expect(outcome).toEqual(withheld)
  })

  describe('an unset threshold fails closed', () => {
    it.each([
      'automaticWithholdingMinTrustTier',
      'automaticWithholdingMinAccountAgeDays',
      'automaticWithholdingClaimantDailyCap',
      'automaticWithholdingPosterDailyCap',
    ])('refuses and queues the notice when %s is unset', async field => {
      await switchOn({ [field]: -1 })
      const { outcome } = await fileAndScreen()
      expect(outcome).toEqual(refusedFor('thresholds_unset'))
    })
  })

  it('refuses a claimant whose account is younger than the approved minimum', async () => {
    await switchOn({ automaticWithholdingMinAccountAgeDays: 7 })
    const young = await createTestUserWithAge(2 * DAY_MS)
    const settled = await createTestUserWithAge(30 * DAY_MS)

    expect((await fileAndScreen({ claimant: young })).outcome).toEqual(
      refusedFor('account_too_new'),
    )
    expect((await fileAndScreen({ claimant: settled })).outcome).toEqual(withheld)
  })

  it('refuses a claimant below the approved trust tier', async () => {
    await switchOn({ automaticWithholdingMinTrustTier: 2 })
    const newer = await createTestUserWithAge(2 * DAY_MS)
    const established = await createTestUserWithAge(200 * DAY_MS)

    expect((await fileAndScreen({ claimant: newer })).outcome).toEqual(
      refusedFor('trust_below_minimum'),
    )
    expect((await fileAndScreen({ claimant: established })).outcome).toEqual(withheld)
  })

  it('refuses a claimant who is suspended', async () => {
    await switchOn()
    const [claimant, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    await suspendUser(admin, claimant.id, 'allow', 'Repeated notices that were withdrawn.')

    const { outcome } = await fileAndScreen({ claimant })
    expect(outcome).toEqual(refusedFor('claimant_suspended'))
  })

  it('never retries a refused notice once the cause clears, so a moderator keeps it', async () => {
    await switchOn({ automaticWithholdingMinAccountAgeDays: 7 })
    const { notice } = await fileAndScreen({ claimant: await createTestUserWithAge(DAY_MS) })
    await switchOn({ automaticWithholdingMinAccountAgeDays: 0 })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    await expect(readTestAutomaticWithholdingOutcome(notice)).resolves.toEqual(
      refusedFor('account_too_new'),
    )
  })

  it('stops redispatching a refused notice to the automation workflow', async () => {
    await switchOn({ automaticWithholdingMinAccountAgeDays: 7 })
    const { notice } = await createClearScreenedForm(1, {
      claimant: await createTestUserWithAge(DAY_MS),
    })
    const submissionId = notice.intake.copyright_notice_submission_id
    await expect(readTestPendingCopyrightAgentDispatches(submissionId)).resolves.toEqual([
      { kind: 'form-effect', submissionId },
    ])

    await applyNonSpamSignedInCopyrightFormScreening(submissionId)

    await expect(readTestPendingCopyrightAgentDispatches(submissionId)).resolves.toEqual([])
  })
})

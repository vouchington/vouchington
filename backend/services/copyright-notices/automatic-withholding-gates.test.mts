import { assertAutomaticWithholdingOutcome } from '@voucha/test-helpers/copyright-automatic-withholding-outcomes'
import { seedCommittedAutomaticRefusal } from '@voucha/test-helpers/copyright-automatic-withholding-fixtures'
import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUserWithAge } from '@voucha/test-helpers'
import {
  overrideAutomaticWithholdingSinceForTest,
  useAutomaticWithholdingSwitch,
} from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { readTestAutomaticWithholdingOutcome } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
  type FormPeople,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { suspendUser } from '@services/users/suspension'
import {
  checkAutomaticWithholdingEligibility,
  type AutomaticWithholdingRefusalReason,
} from './automatic-withholding-gates.mts'
import { getAutomaticWithholdingWindow } from './automatic-withholding-since.mts'

const DAY_MS = 24 * 60 * 60 * 1000

async function fileAndScreen(
  expected: AutomaticWithholdingRefusalReason | 'off' | null,
  people: FormPeople = {},
) {
  const { notice } = await createClearScreenedForm(1, people)
  await assertAutomaticWithholdingOutcome(notice, expected)
}

const refusedFor = (refusal: string) => ({ refusal, assessments: 0, restrictions: 0 })

describe('automatic withholding gates', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it('records nothing while the switch is off, whatever the gates say', async () => {
    expect.hasAssertions()
    await fileAndScreen('off')
  })

  it('withholds when every approved gate passes', async () => {
    await switchOn()
    expect.hasAssertions()
    await fileAndScreen(null)
  })

  it.each([
    '2024-01-31T23:59:59.999Z',
    '2024-02-01T00:00:00.001Z',
    '2024-02-29T23:59:59.999Z',
    '2024-03-01T00:00:00.001Z',
    '2024-12-31T23:59:59.999Z',
    '2025-01-01T00:00:00.001Z',
  ])('uses the current %s switch-on as an inclusive receipt boundary', async instant => {
    await switchOn()
    const since = new Date(instant)
    const restoreSince = await overrideAutomaticWithholdingSinceForTest(since)
    try {
      const window = await getAutomaticWithholdingWindow()
      expect(window).toEqual({ enabled: true, since })

      const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
      for (const [delta, expectedReason] of [
        [-1, 'received_before_switch_on'],
        [0, null],
        [1, null],
      ] as const) {
        const { intake } = await createSignedInCopyrightForm(
          1,
          { claimant, poster },
          { now: new Date(since.getTime() + delta) },
        )
        const eligibility = await checkAutomaticWithholdingEligibility(
          intake.copyright_notice_submission_id,
          window,
        )
        expect(eligibility.reason).toBe(expectedReason)
        expect(eligibility).toMatchObject(
          expectedReason === null ? { claimantId: claimant.id } : { reason: expectedReason },
        )
      }
    } finally {
      restoreSince()
    }
  })

  describe('an unset threshold fails closed', () => {
    it.each([
      'automaticWithholdingMinTrustTier',
      'automaticWithholdingMinAccountAgeDays',
      'automaticWithholdingClaimantDailyCap',
      'automaticWithholdingPosterDailyCap',
    ])('refuses and queues the notice when %s is unset', async field => {
      await switchOn({ [field]: -1 })
      expect.hasAssertions()
      await fileAndScreen('thresholds_unset')
    })
  })

  it('refuses a claimant whose account is younger than the approved minimum', async () => {
    await switchOn({ automaticWithholdingMinAccountAgeDays: 7 })
    const young = await createTestUserWithAge(2 * DAY_MS)
    const settled = await createTestUserWithAge(30 * DAY_MS)

    expect.hasAssertions()
    await fileAndScreen('account_too_new', { claimant: young })
    await fileAndScreen(null, { claimant: settled })
  })

  it('refuses a claimant below the approved trust tier', async () => {
    await switchOn({ automaticWithholdingMinTrustTier: 2 })
    const newer = await createTestUserWithAge(2 * DAY_MS)
    const established = await createTestUserWithAge(200 * DAY_MS)

    expect.hasAssertions()
    await fileAndScreen('trust_below_minimum', { claimant: newer })
    await fileAndScreen(null, { claimant: established })
  })

  it('refuses a claimant who is suspended', async () => {
    await switchOn()
    const [claimant, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    await suspendUser(admin, claimant.id, 'allow', 'Repeated notices that were withdrawn.')

    expect.hasAssertions()
    await fileAndScreen('claimant_suspended', { claimant })
  })

  it('never retries a refused notice once the cause clears, so a moderator keeps it', async () => {
    await switchOn({ automaticWithholdingMinAccountAgeDays: 7 })
    const { notice } = await createClearScreenedForm(1, {
      claimant: await createTestUserWithAge(DAY_MS),
    })
    await seedCommittedAutomaticRefusal(notice, 'account_too_new')
    await switchOn({ automaticWithholdingMinAccountAgeDays: 0 })

    await assertAutomaticWithholdingOutcome(notice, 'sticky')

    await expect(readTestAutomaticWithholdingOutcome(notice)).resolves.toEqual(
      refusedFor('account_too_new'),
    )
  })

  it('stops redispatching a refused notice to the automation workflow', async () => {
    await switchOn({ automaticWithholdingMinAccountAgeDays: 7 })
    await fileAndScreen('account_too_new', { claimant: await createTestUserWithAge(DAY_MS) })
    const { notice } = await createClearScreenedForm(1, {
      claimant: await createTestUserWithAge(DAY_MS),
    })
    const submissionId = notice.intake.copyright_notice_submission_id
    await expect(readTestPendingCopyrightAgentDispatches(submissionId)).resolves.toEqual([
      { kind: 'form-effect', submissionId },
    ])

    // The dispatch read always observes committed refusal, independently of an SSI-aborted actor.
    await seedCommittedAutomaticRefusal(notice, 'account_too_new')

    await expect(readTestPendingCopyrightAgentDispatches(submissionId)).resolves.toEqual([])
  })
})

import {
  seedCommittedAutomaticWithholding,
  seedCommittedAutomaticRefusal,
} from '@voucha/test-helpers/copyright-automatic-withholding-fixtures'
import {
  assertAutomaticWithholdingOutcome,
  assertModeratorAcceptsAutomaticRefusal,
  assertConcurrentAutomaticClaimantCap,
} from '@voucha/test-helpers/copyright-automatic-withholding-outcomes'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { checkTestAutomaticWithholdingCaps } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { readTestAutomaticWithholdingOutcome } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createClearScreenedForm,
  type FormPeople,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'

async function createForm(people: FormPeople = {}) {
  return (await createClearScreenedForm(1, people)).notice
}

const withheld = { refusal: null, assessments: 1, restrictions: 1 }
const DAY_MS = 24 * 60 * 60 * 1000

describe('automatic withholding caps', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it('refuses a claimant past the daily cap and leaves the notice to a moderator', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: 1 })
    const claimant = await createTestUser()
    const [first, second] = [await createForm({ claimant }), await createForm({ claimant })]

    await seedCommittedAutomaticWithholding(first)
    await assertAutomaticWithholdingOutcome(second, 'claimant_daily_cap')

    await expect(readTestAutomaticWithholdingOutcome(first)).resolves.toEqual(withheld)
    // Moderator override always runs on a committed over-cap refusal, independent of the actor above.
    const refused = await createForm({ claimant })
    await seedCommittedAutomaticRefusal(refused, 'claimant_daily_cap')
    await assertModeratorAcceptsAutomaticRefusal(refused, {
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      is_accepted: true,
      rationale: 'The over-cap notice is complete.',
    })
  })

  it('refuses notices against one poster past the per-poster cap', async () => {
    await switchOn({ automaticWithholdingPosterDailyCap: 1 })
    const poster = await createTestUser()
    const [first, second] = [await createForm({ poster }), await createForm({ poster })]

    await seedCommittedAutomaticWithholding(first)
    await assertAutomaticWithholdingOutcome(second, 'poster_daily_cap')

    await expect(readTestAutomaticWithholdingOutcome(first)).resolves.toEqual(withheld)
  })

  it.each([
    ['automaticWithholdingClaimantDailyCap', 'claimant_daily_cap'],
    ['automaticWithholdingPosterDailyCap', 'poster_daily_cap'],
  ] as const)('refuses every notice when %s is zero', async (field, reason) => {
    await switchOn({ [field]: 0 })
    const notice = await createForm()

    expect.hasAssertions()
    await assertAutomaticWithholdingOutcome(notice, reason)
  })

  it('commits at most one automated assessment for two concurrent notices at a cap of one', async () => {
    expect.hasAssertions()
    await switchOn({ automaticWithholdingClaimantDailyCap: 1 })
    const claimant = await createTestUser()
    const first = await createForm({ claimant })
    const second = await createForm({ claimant })
    // The SERIAL assessment consumes the slot even when its later enforcement TX aborts.
    await assertConcurrentAutomaticClaimantCap([first, second])
  })

  it('counts only automated assessments from the last 24 hours', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: 1 })
    const claimant = await createTestUser()
    const notice = await createForm({ claimant })
    await seedCommittedAutomaticWithholding(notice)
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

  it.each([
    ['claimant', 'claimant_daily_cap'],
    ['poster', 'poster_daily_cap'],
  ] as const)(
    'excludes an assessment exactly 24 hours old from the %s cap',
    async (kind, reason) => {
      await switchOn({
        automaticWithholdingClaimantDailyCap: 1000,
        automaticWithholdingPosterDailyCap: 1000,
      })
      const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
      const first = await createForm({ claimant, poster })
      await seedCommittedAutomaticWithholding(first)
      const otherClaimant = kind === 'poster' ? await createTestUser() : claimant
      const next = await createForm(
        kind === 'poster' ? { claimant: otherClaimant, poster } : { claimant },
      )
      const aggregate = await getCopyrightNoticePrivateAggregate(first.intake.copyright_notice_id)
      const assessment = aggregate?.assessments.find(
        row =>
          row.copyright_notice_submission_id === first.intake.copyright_notice_submission_id &&
          row.assessed_by_id === null &&
          row.copyright_notice_form_screening_id !== null,
      )
      expect(assessment).toBeDefined()
      if (!assessment) throw new Error('Expected persisted automated assessment')

      const edge = assessment.assessed_at.getTime() + DAY_MS
      const thresholds =
        kind === 'claimant'
          ? { claimantDailyCap: 1, posterDailyCap: 1000 }
          : { claimantDailyCap: 1000, posterDailyCap: 1 }
      const check = (now: number) =>
        checkTestAutomaticWithholdingCaps({
          noticeId: next.intake.copyright_notice_id,
          claimantId: otherClaimant.id,
          thresholds,
          now: new Date(now),
        })

      await expect(check(edge - 1)).resolves.toBe(reason)
      await expect(check(edge)).resolves.toBeNull()
      await expect(check(edge + 1)).resolves.toBeNull()
    },
  )
})

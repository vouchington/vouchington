import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { copyrightConfig } from './config.mts'
import {
  readClaimantMisuseSummaries,
  readClaimantMisuseSummaryPage,
} from './claimant-misuse-summary.mts'
import { reviewCopyrightFormIntake } from './index.mts'

describe('claimant misuse notice windows', () => {
  let restore: (() => void) | undefined
  beforeAll(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
  })
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('pages independently for each claimant and includes notices without misuse', async () => {
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantMisuseWindowSize: 2 })
    const claimant = await createTestUser()
    const other = await createTestUser()
    const oldest = await createClearScreenedForm(1, { claimant })
    await reviewCopyrightFormIntake({
      intakeId: oldest.notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      is_accepted: false,
      rationale: 'The notice does not identify a work.',
    })
    await createClearScreenedForm(1, { claimant })
    await createClearScreenedForm(1, { claimant })
    await createClearScreenedForm(1, { claimant: other })
    const summaries = await readClaimantMisuseSummaries([claimant.id, other.id, claimant.id])
    const first = summaries.get(claimant.id)!
    expect(first).toMatchObject({
      notice_count: 2,
      notice_rejected: 0,
      page_info: { has_next_page: true },
    })
    expect(summaries.get(other.id)).toMatchObject({
      notice_count: 1,
      page_info: { has_next_page: false },
    })
    const older = await readClaimantMisuseSummaryPage(claimant.id, first.page_info.end_cursor!)
    expect(older).toMatchObject({
      notice_count: 1,
      notice_rejected: 1,
      page_info: { has_next_page: false },
    })
    await expect(
      readClaimantMisuseSummaryPage(other.id, first.page_info.end_cursor!),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects malformed cursors', async () => {
    await expect(
      readClaimantMisuseSummaryPage((await createTestUser()).id, 'invalid'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('handles empty claimants and exact one-notice windows with canonical UUID scopes', async () => {
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantMisuseWindowSize: 1 })
    const claimant = await createTestUser()
    const empty = await createTestUser()
    await createClearScreenedForm(1, { claimant })
    await createClearScreenedForm(1, { claimant })
    const summaries = await readClaimantMisuseSummaries([claimant.id.toUpperCase(), empty.id])
    expect(summaries.get(empty.id)).toEqual({
      notice_withdrawn: 0,
      notice_rejected: 0,
      restriction_reversed_by_counter_notice: 0,
      restriction_reversed_by_appeal: 0,
      notice_count: 0,
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const first = summaries.get(claimant.id)!
    expect(first).toMatchObject({ notice_count: 1, page_info: { has_next_page: true } })
    const last = await readClaimantMisuseSummaryPage(
      claimant.id.toUpperCase(),
      first.page_info.end_cursor!,
    )
    expect(last).toMatchObject({
      notice_count: 1,
      page_info: { has_next_page: false, end_cursor: null },
    })
    expect(last.page_info.start_cursor).not.toBe(first.page_info.start_cursor)
  })
})

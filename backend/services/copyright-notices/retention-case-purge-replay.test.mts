import { describe, expect, it } from 'vitest'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  isCopyrightRationaleRetentionEligibleNow,
  publishCopyrightCasePurgeCoverage,
  readExistingCopyrightRationaleIds,
  readCopyrightCasePurgeFixture,
  settleCopyrightCasePurgeFixtureActions,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  createReplayableCopyrightCasePurgeForm,
  readReplayableCopyrightCasePurgeEmail,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-replay-fixture'
import { createCopyrightFormIntake } from './form-intakes.mts'
import { createCopyrightEmailIntake, ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'
import {
  insertTestCopyrightDecisionRationaleForCase,
  insertTestCopyrightDecisionRationaleForIntake,
} from '@voucha/test-helpers/data-stores/psql/copyright-decision-rationale'

const pageSize = 20

const PURGE_NOW = new Date('2100-01-01T12:00:00.000Z')

function firstPage(noticeId: string): CopyrightCasePurgeJobData {
  return {
    noticeId,
    phase: 'parties',
    phaseIndex: 0,
    afterId: null,
    legalClockAt: null,
    proofVersion: null,
  }
}

async function runToPointerCut(noticeId: string): Promise<CopyrightCasePurgeJobData> {
  let data = firstPage(noticeId)
  for (let page = 0; page < 1_000; page += 1) {
    const result = await runCopyrightCasePurgePage(data, PURGE_NOW, pageSize)
    if (!result.hasMore)
      throw new Error(`Copyright purge stopped before pointer cuts at ${data.phase}`)
    data = result.data
    if (data.phase === 'pointers') return data
  }
  throw new Error(`Copyright purge never reached pointer cuts at ${data.phase}`)
}

async function finishCase(data: CopyrightCasePurgeJobData): Promise<void> {
  let current = data
  for (let page = 0; page < 1_000; page += 1) {
    const result = await runCopyrightCasePurgePage(current, PURGE_NOW, pageSize)
    if (!result.hasMore) {
      const state = await readCopyrightCasePurgeFixture(current.noticeId)
      if (state.live || state.retained)
        throw new Error(`Copyright purge stopped before root deletion at ${current.phase}`)
      return
    }
    current = result.data
  }
  throw new Error(`Copyright purge exceeded 1000 pages at ${current.phase}`)
}

describe('initial copyright submission replay during case purge', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useCopyrightEvidenceBucket()

  // no-mistakes-timeout-reason: reviewed form fixture and bounded case purge pages through final root deletion
  it('replays the original form through pointer cuts, then accepts a new case after the root is gone', async () => {
    const form = await createReplayableCopyrightCasePurgeForm()
    await publishCopyrightCasePurgeCoverage(form.noticeId)
    const before = await createCopyrightFormIntake(form.input)
    expect(before).toMatchObject({ isDuplicate: true, intake: { id: form.intakeId } })

    const pointer = await runToPointerCut(form.noticeId)
    const during = await runCopyrightCasePurgePage(pointer, PURGE_NOW, pageSize)
    expect(during.data.phase).toBe('pointers')
    await expect(createCopyrightFormIntake(form.input)).resolves.toMatchObject({
      isDuplicate: true,
      intake: { id: form.intakeId, copyright_notice_id: form.noticeId },
    })
    await finishCase(during.data)
    const newCase = await createCopyrightFormIntake(form.input)
    expect(newCase.isDuplicate).toBe(false)
    expect(newCase.intake.copyright_notice_id).not.toBe(form.noticeId)
  }, 30_000)

  // no-mistakes-timeout-reason: reviewed email fixture, versioned evidence deletion, and bounded case purge pages
  it('replays the original email before evidence deletion and rejects the same SES message after erasure', async () => {
    const email = await createRetentionEmailCase()
    const aged = new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 15))
    const agedCaseRationale = await insertTestCopyrightDecisionRationaleForCase(
      email.noticeId,
      email.moderator.id,
      aged,
    )
    await insertTestCopyrightDecisionRationaleForIntake(email.intakeId, email.moderator.id)
    // A US case rationale is never retired by the rationale retention sweep; only the purge removes it.
    expect(await isCopyrightRationaleRetentionEligibleNow(agedCaseRationale)).toBe(false)
    const before = await readCopyrightCasePurgeFixture(email.noticeId)
    expect(before.rationaleIds.length).toBeGreaterThanOrEqual(3)
    await settleCopyrightCasePurgeFixtureActions(email.noticeId)
    await publishCopyrightCasePurgeCoverage(email.noticeId)
    for (const key of email.evidenceKeys) await bucket.put(key)
    const input = await readReplayableCopyrightCasePurgeEmail(email.intakeId)
    await expect(createCopyrightEmailIntake(input)).resolves.toMatchObject({ isNew: false })

    const pointer = await runToPointerCut(email.noticeId)
    const during = await runCopyrightCasePurgePage(pointer, PURGE_NOW, pageSize)
    expect(during.data.phase).toBe('pointers')
    await expect(createCopyrightEmailIntake(input)).rejects.toBeInstanceOf(
      ErasedCopyrightEmailIntakeReplay,
    )
    await finishCase(during.data)
    await expect(createCopyrightEmailIntake(input)).rejects.toBeInstanceOf(
      ErasedCopyrightEmailIntakeReplay,
    )
    expect(await readExistingCopyrightRationaleIds(before.rationaleIds)).toEqual([])
  }, 30_000)
})

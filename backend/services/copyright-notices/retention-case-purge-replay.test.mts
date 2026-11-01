import { describe, expect, it } from 'vitest'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  settleCopyrightCasePurgeFixtureActions,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  createReplayableCopyrightCasePurgeForm,
  readReplayableCopyrightCasePurgeEmail,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-replay-fixture'
import { createCopyrightFormIntake } from './form-intakes.mts'
import { createCopyrightEmailIntake, ErasedCopyrightEmailIntakeReplay } from './email-intakes.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

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
    const result = await runCopyrightCasePurgePage(data, PURGE_NOW)
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
    const result = await runCopyrightCasePurgePage(current, PURGE_NOW)
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
  const bucket = useFakeCopyrightEvidenceBucket()
  const setPageSize = useCopyrightCasePurgePageSize()

  // no-mistakes-timeout-reason: reviewed form fixture and bounded case purge pages through final root deletion
  it('replays the original form through pointer cuts, then accepts a new case after the root is gone', async () => {
    await setPageSize(20)
    const form = await createReplayableCopyrightCasePurgeForm()
    await publishCopyrightCasePurgeCoverage(form.noticeId)
    const before = await createCopyrightFormIntake(form.input)
    expect(before).toMatchObject({ isDuplicate: true, intake: { id: form.intakeId } })

    const pointer = await runToPointerCut(form.noticeId)
    const during = await runCopyrightCasePurgePage(pointer, PURGE_NOW)
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
    await setPageSize(20)
    const email = await createRetentionEmailCase()
    await settleCopyrightCasePurgeFixtureActions(email.noticeId)
    await publishCopyrightCasePurgeCoverage(email.noticeId)
    for (const key of email.evidenceKeys) bucket.put(key)
    const input = await readReplayableCopyrightCasePurgeEmail(email.intakeId)
    await expect(createCopyrightEmailIntake(input)).resolves.toMatchObject({ isNew: false })

    const pointer = await runToPointerCut(email.noticeId)
    const during = await runCopyrightCasePurgePage(pointer, PURGE_NOW)
    expect(during.data.phase).toBe('pointers')
    await expect(createCopyrightEmailIntake(input)).rejects.toBeInstanceOf(
      ErasedCopyrightEmailIntakeReplay,
    )
    await finishCase(during.data)
    await expect(createCopyrightEmailIntake(input)).rejects.toBeInstanceOf(
      ErasedCopyrightEmailIntakeReplay,
    )
  }, 30_000)
})

import { describe, expect, it } from 'vitest'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightIntakeRecommendationCount } from '@voucha/test-helpers/copyright-operational-email-retention'
import { deleteCopyrightRecommendationPageForTest } from '@voucha/test-helpers/copyright-recommendation-page'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import {
  getCopyrightEmailIntakeForAgent,
  recordCopyrightEmailParse,
} from './email-intake-parses.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright email admission during operational erasure', () => {
  it('caps recommendation deletion to the remaining child budget', async () => {
    const intake = await createRetentionParsedEmail('recommendation-page-budget')
    for (const marker of [1, 2]) {
      await appendCopyrightEmailIntakeRecommendation({
        intakeId: intake.id,
        inputSha256: Buffer.alloc(32, marker),
        promptVersion: 'budget-test',
        model: 'test-model',
        structuredOutput: { marker },
      })
    }
    expect(await readCopyrightIntakeRecommendationCount(intake.id)).toBe(2)
    expect(await deleteCopyrightRecommendationPageForTest(intake.id, 1)).toBe(1)
    expect(await readCopyrightIntakeRecommendationCount(intake.id)).toBe(1)
    expect(await deleteCopyrightRecommendationPageForTest(intake.id, 1)).toBe(1)
    expect(await readCopyrightIntakeRecommendationCount(intake.id)).toBe(0)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
    })
  })

  it('stops dispatch and plaintext loading when the receipt is marked for erasure', async () => {
    const intake = await createRetentionParsedEmail('agent-erasure-admission')
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([
      { kind: 'email', intakeId: intake.id },
    ])
    const scope1 = createCopyrightOperationalScope([intake.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope1,
      now: future(91),
      retentionDays: 90,
      childLimit: 1,
      maxBatches: 1,
    })
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      parseCount: 1,
      attachmentCount: 1,
    })
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([])
    await expect(getCopyrightEmailIntakeForAgent(intake.id)).resolves.toBeNull()
  })

  it('lets a fresh reply parse while an erased ancestor still has thread references', async () => {
    const messageId = `<expired-ancestor-${crypto.randomUUID()}@example.test>`
    const ancestor = await createRetentionParsedEmail('erasing-ancestor', { messageId })
    const scope2 = createCopyrightOperationalScope([ancestor.id])
    await sweepUnlinkedCopyrightEmailIntakes({
      scope: scope2,
      now: future(91),
      retentionDays: 90,
      childLimit: 1,
      maxBatches: 1,
    })
    expect(await readCopyrightIntakeRetentionState(ancestor.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
    })

    const sesMessageId = `ses-fresh-reply-${crypto.randomUUID()}`
    const { intake: fresh } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 7),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await expect(
      recordCopyrightEmailParse(fresh, {
        status: 'succeeded',
        fromEmail: `sender-${crypto.randomUUID()}@example.test`,
        subject: 'Re: expired ancestor',
        bodyText: 'A healthy new reply.',
        messageId: `<fresh-reply-${crypto.randomUUID()}@example.test>`,
        replyReferences: [messageId],
        attachments: [],
      }),
    ).resolves.toBeNull()
    expect(await readCopyrightIntakeRetentionState(fresh.id)).toMatchObject({
      intakeExists: true,
      parseCount: 1,
      ancestorCount: 0,
    })
  })
})

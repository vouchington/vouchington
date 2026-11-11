import { expect } from 'vitest'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'
import { readCopyrightIntakeRetentionState } from './copyright-email-retention-state.mts'
import { readCopyrightThreadReferenceState } from './copyright-operational-email-retention.mts'
import type { CopyrightEmailIntake } from '../services/copyright-notices/email-intakes.mts'
import {
  recordCopyrightEmailParse,
  type CopyrightEmailParseInput,
} from '../services/copyright-notices/email-intake-parses.mts'
import { buildCopyrightEmailThreadReferenceRows } from '../services/copyright-notices/email-thread-references.mts'

/** A parse commits before SSI threading; a mapped conflict leaves only whole committed phases. */
export async function parseOrAssertSerializableRollback(
  intake: CopyrightEmailIntake,
  input: CopyrightEmailParseInput & { status: 'succeeded' },
): Promise<
  | { conflict: false; match: Awaited<ReturnType<typeof recordCopyrightEmailParse>> }
  | { conflict: true }
> {
  try {
    return { conflict: false, match: await recordCopyrightEmailParse(intake, input) }
  } catch (err) {
    await assertSerializedParseState(intake, input, err)
    return { conflict: true }
  }
}

async function assertSerializedParseState(
  intake: CopyrightEmailIntake,
  input: CopyrightEmailParseInput & { status: 'succeeded' },
  err: unknown,
): Promise<void> {
  expect(err).toMatchObject({ status: 409, cause: { code: '40001' } })
  const retained = await readCopyrightIntakeRetentionState(intake.id)
  expect(retained).toMatchObject({
    intakeExists: true,
    receiptExists: true,
    hasRawObject: true,
    parseCount: 1,
    ancestorCount: 0,
  })
  const expectedReferences = buildCopyrightEmailThreadReferenceRows({
    messageId: input.messageId,
    inReplyTo: input.inReplyTo ?? [],
    references: input.replyReferences,
  }).length
  const { referenceCount } = await readCopyrightThreadReferenceState(intake.id)
  expect([0, expectedReferences]).toContain(referenceCount)
  expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
}

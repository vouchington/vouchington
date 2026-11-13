import { expect } from 'vitest'
import { recordCopyrightEmailThreadReferences } from '../services/copyright-notices/email-threading.mts'
import { copyrightPromotionResult } from './copyright-email-promotion-outcomes.mts'
import {
  readCopyrightPromotionScene,
  type PromotionScene,
} from './copyright-email-promotion-scene-state.mts'
import type { seedCopyrightPromotionThreadSource } from './copyright-promotion-thread-fixtures.mts'

/** Complete parsed/reference facts precede the actual graph-derivation actor, not its ancestor/link effects. */
export async function assertOverBudgetCopyrightReceipt(
  scene: PromotionScene,
  source: Awaited<ReturnType<typeof seedCopyrightPromotionThreadSource>>,
  directAncestorId: string,
) {
  const before = await readCopyrightPromotionScene(scene)
  const [result] = await Promise.allSettled([recordCopyrightEmailThreadReferences(source.thread)])
  const after = await readCopyrightPromotionScene(scene)
  const derived = {
    ...before,
    ancestors: [
      ...before.ancestors,
      {
        reply_message_intake_receipt_id: source.intakeId,
        ancestor_message_intake_receipt_id: directAncestorId,
        reference_kind: 'references',
      },
    ].toSorted(
      (a, b) =>
        String(a.reply_message_intake_receipt_id).localeCompare(
          String(b.reply_message_intake_receipt_id),
        ) ||
        String(a.ancestor_message_intake_receipt_id).localeCompare(
          String(b.ancestor_message_intake_receipt_id),
        ),
    ),
  }
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'copyright_email_thread_changed',
        message: 'Copyright email thread changed; retry staff approval',
        causeCode: '40001',
      },
      state: before,
    },
    { outcome: { status: 'fulfilled', value: null }, state: derived },
  ]).toContainEqual({ outcome: copyrightPromotionResult(result!), state: after })
}

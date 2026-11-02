import { v7 as uuidv7 } from 'uuid'
import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'

/** Case-scoped encrypted rationale for the copyright erasure contract fixtures. */
export async function insertTestCopyrightDecisionRationaleForCase(
  noticeId: string,
  recordedById: string,
  recordedAt: Date = new Date(),
): Promise<string> {
  const id = uuidv7({ msecs: recordedAt.getTime() })
  await write(
    `/* insertTestCopyrightDecisionRationaleForCase */
     INSERT INTO copyright_decision_rationales
       (id, copyright_notice_id, recorded_by_id, tool_name, rationale_ciphertext)
     VALUES ($1, $2, $3, 'replay_copyright_intent', $4)`,
    [
      id,
      noticeId,
      recordedById,
      encryptSecret('Retention fixture rationale', `copyright-decision-rationale:${id}`),
    ],
  )
  return id
}

/** Intake-owned encrypted rationale, kept for an email intake that was linked to a case. */
export async function insertTestCopyrightDecisionRationaleForIntake(
  intakeReceiptId: string,
  recordedById: string,
): Promise<string> {
  const id = uuidv7()
  await write(
    `/* insertTestCopyrightDecisionRationaleForIntake */
     INSERT INTO copyright_decision_rationales
       (id, copyright_notice_email_intake_receipt_id, recorded_by_id, tool_name, rationale_ciphertext)
     VALUES ($1, $2, $3, 'replay_copyright_intent', $4)`,
    [
      id,
      intakeReceiptId,
      recordedById,
      encryptSecret('Retention fixture rationale', `copyright-decision-rationale:${id}`),
    ],
  )
  return id
}

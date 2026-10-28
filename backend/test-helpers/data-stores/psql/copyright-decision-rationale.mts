import { v7 as uuidv7 } from 'uuid'
import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'

/** Case-scoped encrypted rationale for the copyright erasure contract fixtures. */
export async function insertTestCopyrightDecisionRationaleForCase(
  noticeId: string,
  recordedById: string,
): Promise<string> {
  const id = uuidv7()
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

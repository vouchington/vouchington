import { randomUUID } from 'node:crypto'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'

/**
 * The claimant contact of a notice whose initial email is the intake with this SES message id.
 * The staff case reader decrypts it under that intake's purpose, so a fixture that links an intake
 * as a notice's initial email must create the notice with this value or any staff queue read that
 * pages over the committed notice fails to decrypt it.
 */
export function initialEmailClaimantContactCiphertext(
  sesMessageId = `ses-unlinked-${randomUUID()}`,
): string {
  return encryptSecret('claimant@example.test', copyrightEmailIntakePurpose(sesMessageId))
}

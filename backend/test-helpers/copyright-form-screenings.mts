import { beginTransaction } from '@data-stores/psql'
import {
  completeCopyrightFormScreening,
  startCopyrightFormScreeningInTransaction,
  type CopyrightFormScreeningAttempt,
  type CopyrightFormScreeningResultInput,
} from '../services/copyright-notices/form-screening-executions.mts'

/** Start a genuinely new screen; this commits loss of automatic authority before any work. */
export async function startTestCopyrightFormScreening(
  intakeId: string,
): Promise<CopyrightFormScreeningAttempt> {
  await using transaction = await beginTransaction()
  const attempt = await startCopyrightFormScreeningInTransaction(intakeId, transaction)
  await transaction.commit()
  return attempt
}

export async function appendTestCopyrightFormScreening(
  input: CopyrightFormScreeningResultInput,
): Promise<string> {
  const attempt = await startTestCopyrightFormScreening(input.intakeId)
  const result = await completeCopyrightFormScreening(attempt, input)
  if (!result) throw new Error('Copyright screening attempt was superseded')
  return result
}

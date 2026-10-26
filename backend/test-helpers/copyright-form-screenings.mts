import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
  type CopyrightFormScreeningResultInput,
} from '../services/copyright-notices/form-screening-executions.mts'

export async function appendTestCopyrightFormScreening(
  input: CopyrightFormScreeningResultInput,
): Promise<string> {
  const attempt = await claimCopyrightFormScreening(input.intakeId)
  if (!attempt) throw new Error('Copyright screening attempt is not claimable')
  const result = await completeCopyrightFormScreening(attempt, input)
  if (!result) throw new Error('Copyright screening attempt was superseded')
  return result
}

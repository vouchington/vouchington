import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
} from '../services/copyright-notices/form-screening-executions.mts'

type CopyrightFormScreeningResultInput = Parameters<typeof completeCopyrightFormScreening>[1]

export async function appendTestCopyrightFormScreening(
  input: CopyrightFormScreeningResultInput,
): Promise<string> {
  const attempt = await claimCopyrightFormScreening(input.intakeId)
  if (!attempt) throw new Error('Copyright screening attempt is not claimable')
  const result = await completeCopyrightFormScreening(attempt, input)
  if (!result) throw new Error('Copyright screening attempt was superseded')
  return result
}

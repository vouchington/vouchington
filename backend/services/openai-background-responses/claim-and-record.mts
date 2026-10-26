import { beginTransaction } from '@data-stores/psql'
import { recordAiUsage, type RecordAiUsageOptions } from '@services/ai-usage'
import { deleteBackgroundResponseRegistration } from './claim.mts'

/** Keeps inline-response accounting and registry cleanup in one transaction. */
export async function recordAndDeleteBackgroundResponseUsage(
  options: RecordAiUsageOptions & { responseId: string },
): Promise<void> {
  await using query = await beginTransaction()
  await recordAiUsage({ ...options, query })
  await deleteBackgroundResponseRegistration(options.responseId, query)
  await query.commit()
}

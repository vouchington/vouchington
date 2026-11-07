import type { QueryOptions } from '@data-stores/psql'
import { assertUrlsHaveNoBlockedHostnames } from '@services/urls/assert-hostname-not-blocked'
import type { SourceRow } from './story-post-related-url-projection-types.mts'

export type PendingEligibilityInput = {
  row: SourceRow
  referralUrls: ReadonlySet<string>
}

export async function decidePendingRowsInOrder(
  inputs: readonly PendingEligibilityInput[],
  options: QueryOptions,
): Promise<boolean[]> {
  const decisions: boolean[] = []
  for (const input of inputs) {
    // oxlint-disable-next-line no-await-in-loop -- hostname advisory locks must be taken in url id order
    decisions.push(await decidePendingStoryPostRelatedUrlProjectionRow(input, options))
  }
  return decisions
}

export async function decidePendingStoryPostRelatedUrlProjectionRow(
  input: PendingEligibilityInput,
  options: QueryOptions,
): Promise<boolean> {
  if (input.referralUrls.has(input.row.url)) return false
  try {
    // No user id: historical RSS URLs must never penalize @story-teller.
    await assertUrlsHaveNoBlockedHostnames([input.row.url_id], null, options)
    return true
  } catch (err) {
    if (isUnsafeUrlError(err)) return false
    throw err
  }
}

function isUnsafeUrlError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 400 || error.status === 422)
  )
}

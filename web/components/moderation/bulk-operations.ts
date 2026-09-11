export interface ModerationBulkOperation<TId extends string> {
  id: TId
  run: () => Promise<void>
}

export async function runModerationBulkOperations<TId extends string>(
  operations: ModerationBulkOperation<TId>[],
): Promise<Set<TId>> {
  const results = await Promise.allSettled(operations.map(operation => operation.run()))
  const failed = new Set<TId>()
  results.forEach((result, index) => {
    if (result.status === 'rejected') failed.add(operations[index]!.id)
  })
  return failed
}

export function formatModerationBulkMessage(input: {
  succeeded: number
  failed: number
  skipped: number
}): string {
  const parts = [`${input.succeeded} succeeded`]
  if (input.failed > 0) parts.push(`${input.failed} failed`)
  if (input.skipped > 0) parts.push(`${input.skipped} skipped`)
  return parts.join(', ')
}

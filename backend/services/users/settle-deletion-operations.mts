export async function settleUserDeletionOperations(
  operations: readonly Promise<unknown>[],
  message: string,
): Promise<void> {
  const results = await Promise.allSettled(operations)
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected' && !errors.some(err => Object.is(err, result.reason))) {
      errors.push(result.reason)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, message)
}

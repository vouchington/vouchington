export function isTopicAliasOwnershipConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409 &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.startsWith('Alias already belongs to another topic: ')
  )
}

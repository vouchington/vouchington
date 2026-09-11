const USER_DELETION_ERROR_MESSAGE_MAX_LENGTH = 2_000

export function userDeletionErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    USER_DELETION_ERROR_MESSAGE_MAX_LENGTH,
  )
}

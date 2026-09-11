const MAX_FAILURE_MESSAGE_LENGTH = 2_000
const UNKNOWN_PROVIDER_FAILURE_MESSAGE = 'Unknown provider failure'

export function getIneligiblePurchaseReversalFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return (message || UNKNOWN_PROVIDER_FAILURE_MESSAGE).slice(0, MAX_FAILURE_MESSAGE_LENGTH)
}

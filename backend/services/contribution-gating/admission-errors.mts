export class LostContributionAdmissionLeaseError extends Error {}

export function serializeContributionAdmissionFailure(error: unknown): { message: string } {
  return { message: error instanceof Error ? error.message : 'Contribution admission failed' }
}

export class RejectedContributionAdmissionPreconditionError extends Error {
  readonly reason: unknown

  constructor(reason: unknown) {
    super('Contribution admission precondition was rejected')
    this.reason = reason
  }
}

export function isTerminalContributionAdmissionMutationError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  const httpStatus = validHttpStatus(status) ?? validHttpStatus(statusCode)
  return (
    httpStatus !== undefined &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    httpStatus !== 408 &&
    httpStatus !== 429
  )
}

function validHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined
}

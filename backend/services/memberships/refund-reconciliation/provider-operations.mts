export class RefundProviderOperationError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'RefundProviderOperationError'
    this.cause = cause
  }
}

export async function callRefundProvider<Result>(
  operation: string,
  call: () => Promise<Result>,
): Promise<Result> {
  try {
    return await call()
  } catch (err) {
    throw new RefundProviderOperationError(`Stripe refund ${operation} failed`, err)
  }
}

export function unwrapRefundProviderOperationError(error: unknown): unknown {
  return error instanceof RefundProviderOperationError && error.cause ? error.cause : error
}

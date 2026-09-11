import createHttpError from 'http-errors'

export class MembershipRefundRequestConflictError extends Error {
  constructor() {
    super('Refund receipt conflicts with this idempotency request')
    this.name = 'MembershipRefundRequestConflictError'
  }
}

export async function mapMembershipRefundRequestConflict<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof MembershipRefundRequestConflictError)) throw error
    throw createHttpError(409, 'Idempotency key was already used for a different refund request')
  }
}

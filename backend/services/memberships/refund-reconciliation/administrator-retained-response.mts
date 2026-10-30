import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'

export type AdministratorRetainedResponse = {
  refundId: string
  cancellationStatus: 'not_requested' | 'completed'
}

/** Historical response data is an immutable snapshot, not a relation to the deleted receipt. */
export function decodeAdministratorRetainedResponse(value: unknown): AdministratorRetainedResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw createHttpError(500, 'Invalid retained administrator refund response')
  const object = value as Record<string, unknown>
  if (
    typeof object.refundId !== 'string' ||
    !isUUID(object.refundId) ||
    (object.cancellationStatus !== 'not_requested' && object.cancellationStatus !== 'completed')
  )
    throw createHttpError(500, 'Invalid retained administrator refund response')
  return {
    refundId: object.refundId,
    cancellationStatus: object.cancellationStatus,
  }
}

import createHttpError from 'http-errors'

const REFERENCE_MAX_LENGTH = 500

/** The reference is a short matter identifier; the message never echoes the submitted text. */
export function parsePreservationHoldReference(reference: unknown): string {
  const trimmed = typeof reference === 'string' ? reference.trim() : ''
  if (!trimmed || trimmed.length > REFERENCE_MAX_LENGTH) {
    throw createHttpError(
      422,
      `Reference is required and must be at most ${REFERENCE_MAX_LENGTH} characters`,
    )
  }
  return trimmed
}

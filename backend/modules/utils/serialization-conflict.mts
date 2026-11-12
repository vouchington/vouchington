import createHttpError from 'http-errors'

/** A SERIALIZABLE transaction lost a read/write dependency race; the caller sees 409 and may resubmit. */
export async function conflictOnSerializationFailure<T>(
  work: () => Promise<T>,
  message = 'Conflicting account change; try again',
  code?: string,
): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== '40001') throw err
    throw createHttpError(409, message, { cause: err, ...(code ? { code } : {}) })
  }
}

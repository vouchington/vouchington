import createHttpError from 'http-errors'

/** A SERIALIZABLE transaction lost a read/write dependency race; the caller sees 409 and may resubmit. */
export async function conflictOnSerializationFailure<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== '40001') throw err
    throw createHttpError(409, 'Conflicting account change; try again', { cause: err })
  }
}

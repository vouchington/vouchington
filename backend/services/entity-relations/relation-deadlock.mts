import createHttpError from 'http-errors'

export async function conflictOnRelationDeadlock<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== '40P01') throw err
    throw createHttpError(409, 'Conflicting relation change', { cause: err })
  }
}

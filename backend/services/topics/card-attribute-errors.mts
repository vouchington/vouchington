import createHttpError from 'http-errors'

const referenceConstraintErrors: Readonly<Record<string, { status: 404 | 422; message: string }>> =
  {
    topics__cards_topic_id_fkey: { status: 404, message: 'Not found' },
    topics__cards_bank_id_fkey: { status: 422, message: 'Invalid bank_id' },
    topics__cards_brand_id_fkey: { status: 422, message: 'Invalid brand_id' },
  }

export async function mapCardAttributeReferenceError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string }
    const mappedError =
      pgError.code === '23503' && pgError.constraint
        ? referenceConstraintErrors[pgError.constraint]
        : undefined
    if (!mappedError) throw error
    throw createHttpError(mappedError.status, mappedError.message)
  }
}

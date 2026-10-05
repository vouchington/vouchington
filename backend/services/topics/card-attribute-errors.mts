import createHttpError from 'http-errors'

const referenceConstraintErrors: Readonly<Record<string, { status: 404 | 422; message: string }>> =
  {
    card_topics_topic_id_fkey: { status: 404, message: 'Not found' },
    card_topics_bank_id_fkey: { status: 422, message: 'Invalid bank_topic_id' },
    card_topics_brand_id_fkey: { status: 422, message: 'Invalid brand_topic_id' },
  }

export async function mapCardAttributeReferenceError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (err) {
    const pgError = err as { code?: string; constraint?: string }
    const mappedError =
      pgError.code === '23503' && pgError.constraint
        ? referenceConstraintErrors[pgError.constraint]
        : undefined
    if (!mappedError) throw err
    throw createHttpError(mappedError.status, mappedError.message)
  }
}

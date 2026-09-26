import createHttpError from 'http-errors'

export function mapPostUpdateError(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string }
  if (pgError.code === '23503' && pgError.constraint === 'post_data_point_topics_topic_id_fkey') {
    throw createHttpError(422, 'Topic not found')
  }
  throw error
}

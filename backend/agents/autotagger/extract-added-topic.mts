import type { Topic } from '@services/topics/types'

export function extractAddedTopic(result: unknown): Topic | null {
  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    result.success === true &&
    'topic_id' in result &&
    typeof result.topic_id === 'string' &&
    'topic_name' in result &&
    typeof result.topic_name === 'string'
  ) {
    return { id: result.topic_id, name: result.topic_name } as Topic
  }
  return null
}

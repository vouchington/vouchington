import {
  fetchSpendingCategoryAttributes,
  fetchTopic,
  getTopicTypeAttributes,
} from '@/lib/api/client/topics'
import { getTopicTypeSlug } from '@/types/topics'
import {
  resolveTypeAttributeNames,
  type SpendingCategoryAttributes,
  type TopicEditState,
  type TypeAttributes,
  typesWithAttributes,
} from './topic-edit-model'

export async function loadTopicEditState(id: string): Promise<Partial<TopicEditState>> {
  try {
    const [topicData, spendingData] = await Promise.all([
      fetchTopic(id),
      fetchSpendingCategoryAttributes(id).catch(() => null),
    ])
    if (!topicData) return { loading: false, topic: null }
    return {
      ...(await loadTypeAttributes(id, topicData)),
      isForeignTransaction:
        (spendingData as SpendingCategoryAttributes | null)?.is_foreign_transaction ?? false,
      loadError: null,
      loading: false,
      spendingFrequency:
        (spendingData as SpendingCategoryAttributes | null)?.default_spending_frequency ?? '',
      topic: topicData,
      topicTypeValue: topicData.topic_type ?? '',
      typeSaving: false,
    }
  } catch (error) {
    return {
      loadError: error instanceof Error ? error.message : 'Failed to load topic',
      loading: false,
    }
  }
}

async function loadTypeAttributes(id: string, topic: { topic_type?: string | null }) {
  const currentType = topic.topic_type
  if (!currentType || !typesWithAttributes.has(currentType))
    return { typeAttributes: null, typeAttributeNames: {} }
  try {
    const typeAttributes = await getTopicTypeAttributes<TypeAttributes>(
      id,
      getTopicTypeSlug(currentType),
    )
    return {
      typeAttributes,
      typeAttributeNames: await resolveTypeAttributeNames(
        typeAttributes,
        async topicId => (await fetchTopic(topicId))?.name,
      ),
    }
  } catch {
    return { typeAttributes: null, typeAttributeNames: {} }
  }
}

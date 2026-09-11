import { read } from '@data-stores/psql'
import { USER_TAGS, USER_TAG_SLUGS, type UserTagSlug } from '@voucha/types/entities/user-tags'
import sql from 'sql-template-strings'

export type UserTagTopic = { id: string; slug: UserTagSlug; label: string }

export async function getUserTagTopics(): Promise<UserTagTopic[]> {
  const { rows } = await read(sql`/* getUserTagTopics */
    SELECT id, slug
    FROM topics
    WHERE slug = ANY(${USER_TAG_SLUGS})
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
  `)
  const labelBySlug = new Map(USER_TAGS.map(tag => [tag.slug, tag.label]))
  return rows
    .map(row => ({
      id: row.id as string,
      slug: row.slug as UserTagSlug,
      label: labelBySlug.get(row.slug as UserTagSlug)!,
    }))
    .sort((a, b) => USER_TAG_SLUGS.indexOf(a.slug) - USER_TAG_SLUGS.indexOf(b.slug))
}

export async function isUserTagTopicId(topicId: string): Promise<boolean> {
  const topics = await getUserTagTopics()
  return topics.some(topic => topic.id === topicId)
}

import { read, beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import sql from 'sql-template-strings'

export type TestPostCategoryFinalization = {
  post_id: string
  actor_user_ids: string[]
  topic_category_owner_id: string
  generation: string
}

export type TestPostCategoryFinalizationEdit = {
  actor: PrivateUser
  markdown: string
  title?: string
}

export type TestPostCategoryFinalizationEditOptions = QueryOptions

export async function getTestPostCategoryFinalization(
  postId: string,
): Promise<TestPostCategoryFinalization | undefined> {
  const { rows } = await read<TestPostCategoryFinalization>(sql`
    /* getTestPostCategoryFinalization */
    SELECT post_id, fn_post_category_finalization_actor_ids(post_id) AS actor_user_ids,
      topic_category_owner_id, generation
    FROM post_category_finalizations
    WHERE post_id = ${postId}
  `)
  return rows[0]
}

export async function getTestAdmissionResponseTopicSnapshot(postId: string): Promise<{
  responseGeneration: string | null
  topicCount: number
} | null> {
  const { rows } = await read<{
    admission_response_generation: string | null
    topic_count: number
  }>(sql`
    /* getTestAdmissionResponseTopicSnapshot */
    SELECT finalization.admission_response_generation::text AS admission_response_generation,
      (
        SELECT COUNT(*)::int
        FROM post_category_finalization_admission_topics topic
        WHERE topic.post_id = finalization.post_id
      ) AS topic_count
    FROM post_category_finalizations finalization
    WHERE finalization.post_id = ${postId}
  `)
  const row = rows[0]
  if (!row) return null
  return {
    responseGeneration: row.admission_response_generation,
    topicCount: Number(row.topic_count),
  }
}

export async function hasTestPostCategoryAdmissionResponseFinalization(
  postId: string,
): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(sql`
    /* hasTestPostCategoryAdmissionResponseFinalization */
    SELECT EXISTS (
      SELECT 1 FROM post_category_finalizations
      WHERE post_id = ${postId}
        AND admission_response_generation = generation
        AND admission_response_generation IS NOT NULL
    ) AS exists
  `)
  return rows[0]!.exists
}

export async function persistTestPostCategoryFinalizationEdits({
  applyEdit,
  edits,
}: {
  applyEdit: (
    edit: TestPostCategoryFinalizationEdit,
    options: TestPostCategoryFinalizationEditOptions,
  ) => Promise<void>
  edits: TestPostCategoryFinalizationEdit[]
}): Promise<void> {
  {
    await using transaction = await beginTransaction()
    for (const edit of edits) await applyEdit(edit, { query: transaction })
    await transaction.commit()
  }
}

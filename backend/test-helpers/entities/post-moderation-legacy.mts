import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setPostOpenAIModerationLegacyScalarResults(postId: string): Promise<void> {
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_flagged = TRUE,
      openai_omni_moderation_results = '"legacy-scalar"'::jsonb
    WHERE id = ${postId}
  `)
}

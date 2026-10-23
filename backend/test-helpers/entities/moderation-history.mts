import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function insertTestOldSupersededModerationVersion(
  postId: string,
  createdAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(sql`/* insertTestOldSupersededModerationVersion */
    INSERT INTO post_moderation_versions (id, post_id, content_sha256, policy_revision)
    SELECT ${id}::uuid, id, llm_moderation_content_sha256, 'superseded-test-policy'
    FROM posts WHERE id = ${postId}`)
  await write(sql`/* insertTestOldSupersededModerationVersion:disposition */
    INSERT INTO post_moderation_dispositions
      (version_id, source, disposition, reason_code, evidence)
    VALUES (${id}::uuid, 'openai_omni', 'pass', 'provider_pass',
      '{"provider_input":"superseded"}'::jsonb)`)
  return id
}

export async function getTestModerationVersionIds(postId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`/* getTestModerationVersionIds */
    SELECT id FROM post_moderation_versions WHERE post_id = ${postId} ORDER BY id`)
  return rows.map(row => row.id)
}

export async function getTestAgentModerationIds(postId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`/* getTestAgentModerationIds */
    SELECT id FROM agent_moderations WHERE post_id = ${postId} ORDER BY id`)
  return rows.map(row => row.id)
}

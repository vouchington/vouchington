import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createPostSlug } from './slugs.mts'
import { getPostByAny } from './get.mts'
import type { Post } from './types.mts'
import { createPostRevision, computePostChanges } from '@services/post-revisions'
import { setPostClearanceStatus } from '@services/post-clearance'

// The platform authors story posts, whichever request or job asked for the story.
export async function insertStoryPostRecord(
  input: {
    title: string
    aiSummaryMarkdown: string
    createdById: string
    embeddingContentSha: Buffer
    moderationContentSha: Buffer
  },
  options: QueryOptions,
): Promise<Post> {
  const { rows: postRows } = await write(
    sql`/* insertStoryPostRecord */
    INSERT INTO posts (
      post_type,
      title,
      markdown,
      ai_summary_markdown,
      created_by_id,
      broadcast,
      privacy,
      is_anonymous,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256,
      created_via,
      created_via_oauth_client_id
    )
    VALUES (
      'story',
      ${input.title},
      '',
      ${input.aiSummaryMarkdown},
      ${input.createdById},
      'everyone',
      'public',
      false,
      ${input.embeddingContentSha},
      ${input.moderationContentSha},
      ${SYSTEM_PROVENANCE.createdVia},
      ${SYSTEM_PROVENANCE.oauthClientId}
    )
    RETURNING *
  `,
    options,
  )
  const rawPost = postRows[0]!

  await setPostClearanceStatus(rawPost.id as string, 'approved', input.createdById, options)

  await createPostSlug(rawPost, undefined, options)

  const changes = computePostChanges(null, rawPost)
  await createPostRevision(rawPost.id as string, 'create', changes, input.createdById, options)

  const fullPost = await getPostByAny(rawPost.id as string, options)
  assert(fullPost, 500, 'Failed to retrieve created story post')

  return fullPost
}

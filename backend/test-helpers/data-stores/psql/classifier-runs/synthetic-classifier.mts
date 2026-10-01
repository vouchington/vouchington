import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ClassifierRunAdapter } from '../../../../services/classifier-runs/index.mts'
import { createPostModerationContent } from '../../../../services/posts/content.mts'
import { createTestPost, createTestUser } from '../../../index.mts'

export type SyntheticConfiguration = { version: number }
export type SyntheticEffects = { runId: string }

/**
 * A stand-in for C8 or C9: a local-only classifier over posts. Everything the adapter supplies is
 * input reading, configuration resolution and outcome application, which is all a new classifier
 * owes the shared lifecycle.
 */
export async function createSyntheticClassifier() {
  const slug = `synthetic-${randomUUID()}`
  const actor = await createTestUser()
  await write(sql`/* createSyntheticClassifierForTest */
    INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at)
    VALUES (${slug}, 'noul', 'topic', CURRENT_TIMESTAMP)
  `)
  const state = {
    version: 1,
    configured: true,
    unresolvable: false,
    ready: true,
    failEffects: false,
    applied: [] as string[],
  }
  const adapter: ClassifierRunAdapter<SyntheticConfiguration, never, SyntheticEffects> = {
    slug,
    async lockCurrent(query, subject) {
      const { rows } = await query<{ input_sha256: Buffer; community_id: string | null }>(sql`
        /* lockSyntheticClassifierInput */
        SELECT llm_moderation_content_sha256 AS input_sha256, community_id FROM posts
        WHERE id = ${subject.postId} AND deleted_at IS NULL AND approved_at IS NOT NULL FOR UPDATE
      `)
      const post = rows[0]
      return post ? { inputSha256: post.input_sha256, communityId: post.community_id } : null
    },
    async resolve(_current, query = write) {
      if (state.unresolvable) throw new Error('synthetic classifier configuration is unavailable')
      if (!state.configured) return null
      const configuration = { version: state.version }
      const { rows } = await query<{ configuration_json: string }>(sql`
        /* resolveSyntheticClassifierConfiguration */
        SELECT ${JSON.stringify(configuration)}::jsonb::text AS configuration_json
      `)
      const configurationJson = rows[0]!.configuration_json
      return {
        configuration,
        configurationJson,
        configurationSha256: createHash('sha256').update(configurationJson).digest(),
        actorId: actor.id,
        remote: null,
      }
    },
    ready: async () => state.ready,
    requestEligibility: () => sql`EXISTS (
      SELECT 1 FROM posts post
      WHERE post.id = request.post_id AND post.deleted_at IS NULL AND post.approved_at IS NOT NULL
        AND post.llm_moderation_content_sha256 = request.input_sha256
    )`,
    async applyEffects(_query, lease) {
      if (state.failEffects) throw new Error('synthetic effect failed')
      state.applied.push(lease.runId)
      return { runId: lease.runId }
    },
  }
  return { slug, adapter, actorId: actor.id, state }
}

export type SyntheticPost = { id: string; inputSha256: Buffer }

/** An approved post whose current moderation content digest is retained on the post. */
export async function createSyntheticPost(): Promise<SyntheticPost> {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setSyntheticPostContent(post.id, inputSha256)
  return { id: post.id, inputSha256 }
}

export async function setSyntheticPostContent(postId: string, inputSha256: Buffer): Promise<void> {
  await write(sql`/* setSyntheticPostContent */
    UPDATE posts SET llm_moderation_content_sha256 = ${inputSha256} WHERE id = ${postId}
  `)
}

/** Edits the post so it carries a different content digest, as a content revision would. */
export async function reviseSyntheticPost(postId: string): Promise<Buffer> {
  const inputSha256 = randomBytes(32)
  await setSyntheticPostContent(postId, inputSha256)
  return inputSha256
}

/** A synthetic classifier and an approved post for it to run over. */
export async function createSyntheticFixture() {
  const classifier = await createSyntheticClassifier()
  const post = await createSyntheticPost()
  const subject = { postId: post.id, rssFeedItemId: null } as const
  return { ...classifier, post, subject }
}

export type SyntheticFixture = Awaited<ReturnType<typeof createSyntheticFixture>>

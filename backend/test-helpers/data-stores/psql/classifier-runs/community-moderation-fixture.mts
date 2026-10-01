import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import type { CommunityAutomodAction } from '@voucha/types'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import sql from 'sql-template-strings'
import {
  reserveClassifierRun,
  requestClassifierRuns,
} from '../../../../services/classifier-runs/index.mts'
import { createCommunityModerationRunAdapter } from '../../../../services/community-agent-prompts/index.mts'
import { createPostModerationContent } from '../../../../services/posts/content.mts'
import { getPostByAny } from '../../../../services/posts/get.mts'
import type { Post } from '../../../../services/posts/types.mts'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  setPostLLMModerationContentSha256,
} from '../../../index.mts'

export { COMMUNITY_MODERATION_CLASSIFIER_SLUG }

export async function setTestCommunityAutomodAction(
  communityId: string,
  action: CommunityAutomodAction,
): Promise<void> {
  await write(sql`/* setTestCommunityAutomodAction */
    UPDATE communities SET automod_action = ${action}::community_automod_action
    WHERE id = ${communityId}
  `)
}

/** The content digest the post's current text hashes to, which is what C8 keys a request on. */
async function currentModerationDigest(postId: string): Promise<Buffer> {
  const post = (await getPostByAny(postId)) as Post
  return createPostModerationContent(post).content_sha256
}

/**
 * A published community post for C8: the community's creator holds a pro plan with `ruleTexts`
 * active prompts (one per rule text), the post is approved, unrejected and published in the
 * community, and its moderation digest is set so it is the request identity.
 */
export async function createCommunityModerationFixture(
  options: {
    ruleTexts?: readonly string[]
    automodAction?: CommunityAutomodAction
    title?: string
    markdown?: string
  } = {},
) {
  const ruleTexts = options.ruleTexts ?? ['No spam', 'No harassment']
  const creator = await createTestUser()
  await createTestMembership({ user_id: creator.id, plan: 'pro' })
  const author = await createTestUser()
  const community = await insertTestCommunity({ createdById: creator.id })
  await insertTestCommunityMember({ communityId: community.id, userId: creator.id, role: 'owner' })
  if (options.automodAction)
    await setTestCommunityAutomodAction(community.id, options.automodAction)
  const prompts = await Promise.all(
    ruleTexts.map(prompt =>
      insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: creator.id,
        prompt,
        slotAllocated: true,
      }),
    ),
  )
  const postId = await insertTestPost({
    title: options.title ?? `C8 post ${randomUUID()}`,
    slug: `c8-post-${randomUUID()}`,
    createdById: author.id,
    markdown: options.markdown ?? 'A post under the community rules.',
    communityId: community.id,
    clearanceStatus: 'approved',
  })
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: author.id,
  })
  const inputSha256 = await currentModerationDigest(postId)
  await setPostLLMModerationContentSha256(postId, inputSha256)
  const subject = { postId, rssFeedItemId: null } as const
  return { creator, author, community, prompts, postId, inputSha256, subject }
}

export type CommunityModerationFixture = Awaited<
  ReturnType<typeof createCommunityModerationFixture>
>

/** The durable request the lifecycle change writes for C8, and nothing else. */
export function requestCommunityModerationFixtureRun(fixture: {
  subject: CommunityModerationFixture['subject']
  inputSha256: Buffer
}) {
  return requestClassifierRuns(write, {
    subject: fixture.subject,
    inputSha256: fixture.inputSha256,
    classifierSlugs: [COMMUNITY_MODERATION_CLASSIFIER_SLUG],
  })
}

/** The request, then the reservation the dispatcher makes, without queueing a job. */
export async function reserveCommunityModerationFixtureRun(
  fixture: Parameters<typeof requestCommunityModerationFixtureRun>[0],
) {
  await requestCommunityModerationFixtureRun(fixture)
  const reserved = await reserveClassifierRun(
    createCommunityModerationRunAdapter(),
    fixture.subject,
  )
  if (reserved.kind !== 'reserved') throw new Error(`Expected a reservation, got ${reserved.kind}`)
  return reserved.run
}

/** Edits the post text and moves its moderation digest, as the content-changed pipeline does. */
export async function reviseCommunityModerationFixturePost(
  fixture: CommunityModerationFixture,
  markdown: string,
): Promise<Buffer> {
  await write(sql`/* reviseCommunityModerationFixturePost */
    UPDATE posts SET markdown = ${markdown} WHERE id = ${fixture.postId}
  `)
  const inputSha256 = await currentModerationDigest(fixture.postId)
  await setPostLLMModerationContentSha256(fixture.postId, inputSha256)
  return inputSha256
}

export async function editTestCommunityRule(promptId: string, text: string): Promise<void> {
  await write(sql`/* editTestCommunityRule */
    UPDATE agent_prompts SET prompt = ${text} WHERE id = ${promptId}
  `)
}

export async function deactivateTestCommunityPrompt(promptId: string): Promise<void> {
  await write(sql`/* deactivateTestCommunityPrompt */
    UPDATE community_agent_prompts
    SET slot_allocated = false, activated_at = NULL, deactivated_at = now()
    WHERE id = ${promptId}
  `)
}

/** Leaves only an AI summary, which the moderation classifier cannot read as the author's text. */
export async function blankTestCommunityPostText(postId: string): Promise<void> {
  await write(sql`/* blankTestCommunityPostText */
    UPDATE posts SET title = '', markdown = '', ai_summary_markdown = 'An automatic summary'
    WHERE id = ${postId}
  `)
}

/** Puts the post's publication under platform control, which community automod never overrides. */
export async function setTestCommunityPostReviewPlatformOverride(
  postId: string,
  overriddenById: string,
): Promise<void> {
  await write(sql`/* setTestCommunityPostReviewPlatformOverride */
    UPDATE community_post_reviews
    SET platform_override_at = now(), platform_override_by_id = ${overriddenById},
      platform_override_action = 'approve'
    WHERE post_id = ${postId}
  `)
}

/** The per-prompt projection rows C8 wrote for a post, by prompt, with the digest they cover. */
export async function readCommunityModerationProjection(
  postId: string,
): Promise<Array<{ prompt_id: string; flagged: boolean; input_sha256: Buffer }>> {
  const { rows } = await read<{ prompt_id: string; flagged: boolean; input_sha256: Buffer }>(sql`
    /* readCommunityModerationProjection */
    SELECT prompt_id, flagged, input_sha256 FROM agent_moderations
    WHERE post_id = ${postId} ORDER BY prompt_id
  `)
  return rows
}

import {
  getModeratorConfig,
  checkExistingModeration,
  insertPostModerationAgent,
} from '@services/moderation'
import { prepareModerationInput, callOpenAIModeration } from './openai-moderation.mts'
import { createPostModerationContent } from '@services/posts/content'
import { tagPostWithTopicsForModerators } from '@services/moderators'
import { getPrivateUserByAny } from '@services/users'
import { getModerationSystemUserId } from '@services/users/system-users'
import { updateClearanceStatus } from '@services/post-clearance'
import type { Post } from '@services/posts/types'
import type { AgentModerationStoredResults } from '@services/moderation/results'
import onError from '@modules/on-error'
import { AI_GENERATED_MODERATOR_SLUG } from './constants.mts'
import { getTopicSlugsForModerator } from './tagging-topics.mts'
interface ModerationResult {
  moderator_slug: string
  moderation_id: {
    post_id: string
    input_sha256: Buffer
    prompt_id: string
  } | null
  flagged: boolean
  skipped: boolean
  tagged_topics?: string[]
  error?: string
}
type DetectAiGeneratedModeration = (input: string) => Promise<AgentModerationStoredResults>
interface RunModeratorOnPostOptions {
  promptId?: string
  communityId?: string | null
  callModeration?: typeof callOpenAIModeration
  detectAiGenerated?: DetectAiGeneratedModeration
}
// Discriminated on `usage`: the local AI-generated detector makes no OpenAI request, so it has
// no model/service_tier to report — that state is unrepresentable rather than a fabricated tier.
type ConfiguredModerationResult =
  | {
      result: AgentModerationStoredResults
      usage: import('@modules/openai-utils').OpenAIUsage
      model: string
      service_tier: string
    }
  | { result: AgentModerationStoredResults; usage: null }
function createSkippedResult(moderatorSlug: string, error?: string): ModerationResult {
  return {
    moderator_slug: moderatorSlug,
    moderation_id: null,
    flagged: false,
    skipped: true,
    ...(error && { error }),
  }
}
export async function runModeratorOnPost(
  post: Post,
  moderatorSlug: string,
  options?: RunModeratorOnPostOptions,
): Promise<ModerationResult> {
  if (post.rejected_at || post.in_review_at) {
    return createSkippedResult(moderatorSlug, 'Skipped: post is not cleared for publication')
  }
  const config = await getModeratorConfig(moderatorSlug, options?.promptId)
  if (!config) {
    return createSkippedResult(moderatorSlug, 'Moderator not found or not active')
  }
  const {
    content_sha256: input_sha256,
    texts,
    title,
    markdown,
    image_captions,
  } = createPostModerationContent(post)
  if (texts.length === 0) {
    return createSkippedResult(config.moderator_slug)
  }

  const existingModeration = await checkExistingModeration(post.id, input_sha256, config.prompt.id)

  if (existingModeration) {
    return {
      moderator_slug: config.moderator_slug,
      moderation_id: {
        post_id: existingModeration.post_id,
        input_sha256: existingModeration.input_sha256,
        prompt_id: existingModeration.prompt_id,
      },
      flagged: existingModeration.flagged,
      skipped: true,
    }
  }

  const configuredModeration = await runConfiguredModeration(
    title,
    markdown,
    image_captions,
    config,
    post,
    options,
  )
  const modResult = configuredModeration.result

  const moderationId = await insertPostModerationAgent(
    post.id,
    input_sha256,
    config.prompt.id,
    config.moderator_id,
    modResult,
    modResult.flagged,
  )

  if (!moderationId) {
    return createSkippedResult(config.moderator_slug)
  }

  if (modResult.flagged && config.on_flag_action === 'review_queue') {
    const moderationSystemUserId = await getModerationSystemUserId()
    await updateClearanceStatus(post.id, 'in_review', moderationSystemUserId).catch(onError)
  }

  let tagged_topics: string[] = []
  if (modResult.flagged) {
    tagged_topics = await tagFlaggedPost(
      post.id,
      config.moderator_slug,
      modResult.categories,
      config.system_user_id,
    )
  }

  return {
    moderator_slug: config.moderator_slug,
    moderation_id: moderationId,
    flagged: modResult.flagged,
    skipped: false,
    tagged_topics,
  }
}

async function tagFlaggedPost(
  postId: string,
  moderatorSlug: string,
  categories: string[] | undefined,
  systemUserId: string,
): Promise<string[]> {
  const systemUser = await getPrivateUserByAny(systemUserId)
  if (!systemUser) return []

  const topicsToTag = getTopicSlugsForModerator(moderatorSlug, categories)
  if (topicsToTag.length === 0) return []

  const result = await tagPostWithTopicsForModerators(systemUser, postId, topicsToTag).catch(
    (error: Error) => {
      /* c8 ignore next -- error path requires injecting a tagging failure */
      onError(error)
      return { success: false, tagged: [] as string[], errors: [] as string[] }
    },
  )

  return result.tagged
}

async function runConfiguredModeration(
  title: string,
  markdown: string,
  imageCaptions: string[],
  config: NonNullable<Awaited<ReturnType<typeof getModeratorConfig>>>,
  post: Post,
  options?: RunModeratorOnPostOptions,
): Promise<ConfiguredModerationResult> {
  if (config.moderator_slug === AI_GENERATED_MODERATOR_SLUG) {
    const input = [title, markdown].filter(Boolean).join('\n\n')
    if (!options?.detectAiGenerated) {
      throw new Error(
        `Cannot run moderator '${config.moderator_slug}' without options.detectAiGenerated`,
      )
    }
    return {
      result: await options.detectAiGenerated(input),
      usage: null,
    }
  }

  const input = prepareModerationInput(title, markdown, imageCaptions)
  const callModeration = options?.callModeration ?? callOpenAIModeration
  return callModeration(input, config, post, options?.communityId ?? null)
}

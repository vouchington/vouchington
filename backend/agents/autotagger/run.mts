import type { Post } from '@services/posts/types'
import { createPostAutotagContent } from './content.mts'
import { searchTopicsByPostEmbedding } from '@services/topics/tools/by-post-embedding'
import {
  hasExistingPostAutotagging,
  insertPostAutotaggingResult,
  getActiveAutotaggerPrompt,
  type PostAutotagResult,
} from '@services/autotagger'
import { createConversation, createConversationMessage } from '@services/conversations-messages'
import { getSystemUserByUsername } from '@services/users/system-users'
import { callOpenAIAutotagger } from './openai-autotagger.mts'
import onError from '@modules/on-error'
import { isOpenAIRateLimitError } from '@modules/openai-utils/rate-limit'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'

export type PostAutotagRunResult = PostAutotagResult & {
  skipped?: boolean
  error?: string
}

export interface AutotaggerDispatch<TEntity extends { id: string }, TResult> {
  entityType: 'post' | 'rss_feed_item'
  // Non-null when the entity belongs to a community; RSS feed items leave this undefined.
  communityId?: string | null
  hasExisting: (entityId: string) => Promise<boolean>
  createContent: (entity: TEntity) => Promise<{ content: string; content_sha256: Buffer }>
  searchSeededTopics: (entityId: string, limit: number) => Promise<{ id: string; name: string }[]>
  insertResult: (
    entityId: string,
    content_sha256: Buffer,
    prompt_id: string,
    topic_ids: string[],
  ) => Promise<TResult>
  makeErrorResult: (entityId: string) => TResult
  // Called after the LLM step (if any ran) with the topic ids it added, before insertResult
  // writes the durable idempotency marker -- so a crash between the two leaves the marker
  // unwritten and the next retry safely re-applies this (idempotent) enrichment. Posts leave this
  // undefined; RSS feed items use it for the no-LLM collaborative-follower topic pass.
  enrichExtraTopics?: (entityId: string, llmAddedTopicIds: string[]) => Promise<void>
}

export interface AutotaggerDeps {
  callOpenAIAutotagger?: typeof callOpenAIAutotagger
  isOpenAIRateLimitError?: typeof isOpenAIRateLimitError
  searchSeededTopics?: AutotaggerDispatch<any, any>['searchSeededTopics']
  getSystemUserByUsername?: typeof getSystemUserByUsername
}

export interface RunAutotaggerOptions {
  // Forwarded to callOpenAIAutotagger; omitted falls back to its own MAX_TOPICS default (10),
  // matching pre-tiering behavior byte-for-byte for any caller that doesn't opt in.
  max_topics?: number
  // When false, the LLM step -- and everything only needed for it (system user, conversation,
  // seeded-topic search) -- is skipped entirely and no OpenAI call is made. Defaults to true.
  shouldRunLlm?: boolean
}

// Exported for run-rss-feed-item.mts, which drives this same engine with RSS-specific dispatch +
// discoverability/kill-switch-derived options -- kept in a separate file to stay under the
// per-file line cap without distorting either entity type's flow.
export async function runAutotagger<TEntity extends { id: string }, TResult extends object>(
  entity: TEntity,
  dispatch: AutotaggerDispatch<TEntity, TResult>,
  deps: AutotaggerDeps = {},
  options: RunAutotaggerOptions = {},
): Promise<(TResult & { skipped?: boolean; error?: string }) | null> {
  const callAutotagger = deps.callOpenAIAutotagger ?? callOpenAIAutotagger
  const rateLimitCheck = deps.isOpenAIRateLimitError ?? isOpenAIRateLimitError
  const getAutotaggerSystemUser = deps.getSystemUserByUsername ?? getSystemUserByUsername
  const shouldRunLlm = options.shouldRunLlm ?? true

  try {
    if (await dispatch.hasExisting(entity.id)) return null

    const activePrompt = await getActiveAutotaggerPrompt()
    if (!activePrompt) return null

    const { content, content_sha256 } = await dispatch.createContent(entity)

    let topicIds: string[] = []

    if (shouldRunLlm) {
      const searchSeededTopics = deps.searchSeededTopics ?? dispatch.searchSeededTopics
      const seededTopics = await searchSeededTopics(entity.id, 10)

      const autotaggerUser = await getAutotaggerSystemUser('autotagger')
      if (!autotaggerUser) {
        throw new Error('Autotagger system user not found')
      }

      const conversationTitle = `Autotag: ${dispatch.entityType}:${entity.id}`
      // ast-grep-ignore: no-three-sequential-awaits -- agent flow creates dependent conversation/run state in order
      const conversation = await createConversation(autotaggerUser.id, conversationTitle)

      const message = await createConversationMessage(conversation.id, autotaggerUser.id, {
        type: 'autotag',
        entity_type: dispatch.entityType,
        entity_id: entity.id,
      })

      const { topics_added } = await callAutotagger(
        autotaggerUser,
        dispatch.entityType,
        entity.id,
        content,
        {
          conversationId: conversation.id,
          conversationMessageId: message.id,
          instructions: activePrompt.prompt,
          seeded_topics: seededTopics,
          max_topics: options.max_topics,
          communityId: dispatch.communityId,
        },
      )
      topicIds = topics_added.map(t => t.id)
    }

    if (dispatch.enrichExtraTopics) {
      await dispatch.enrichExtraTopics(entity.id, topicIds)
    }

    const result = await dispatch.insertResult(entity.id, content_sha256, activePrompt.id, topicIds)

    return { ...result, skipped: false }
  } catch (error) {
    if (error instanceof OpenAiSpendCapBreachError) throw error
    const err = error instanceof Error ? error : new Error(String(error))
    if (rateLimitCheck(err)) throw err
    ;(err as unknown as { extra: unknown }).extra = {
      entity_id: entity.id,
      entity_type: dispatch.entityType,
    }
    onError(err)
    return { ...dispatch.makeErrorResult(entity.id), error: err.message }
  }
}

export function runAutotaggerOnPost(
  post: Post,
  deps?: AutotaggerDeps,
  options?: { max_topics?: number },
): Promise<PostAutotagRunResult | null> {
  return runAutotagger<Post, PostAutotagResult>(
    post,
    {
      entityType: 'post',
      communityId: post.community_id,
      hasExisting: hasExistingPostAutotagging,
      createContent: createPostAutotagContent,
      searchSeededTopics: searchTopicsByPostEmbedding,
      insertResult: insertPostAutotaggingResult,
      makeErrorResult: id => ({
        post_id: id,
        prompt_id: '',
        content_sha256: Buffer.alloc(32),
        topics_added: [],
        created_at: new Date(),
      }),
    },
    deps,
    options,
  )
}

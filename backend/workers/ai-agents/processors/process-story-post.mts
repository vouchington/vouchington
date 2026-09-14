import type { Job } from 'glide-mq'
import type { StoryPostJobData } from '@queues/ai-agents/types'
import { getPostByAny, getPostModerationCompletion } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import { getStoryById, getStoryItemSummaries } from '@services/stories/get'
import { getPostStoryByPostId } from '@services/stories/get-post-stories'
import { callStoryPostAgent } from '@agents/story-post'
import { updateStoryPostAgentResult } from '@services/posts/update-story-post-agent-result'
import { unrecoverable } from '@modules/queue-errors'

// #8773 round-15 finding: shared by processAIAgentWorkerJob's spend-cap gate
// (backend/workers/ai-agents/workers/core.mts) so a daily-cap breach can tell a story-post job
// that would actually call callStoryPostAgent apart from one that only runs the spend-free
// recovery path below (re-persisting an existing summary to re-trigger downstream moderation/spam/
// embedding jobs). Takes the already-fetched post so it never disagrees with processStoryPost's own
// gate on the same read.
function storyPostWouldCallOpenAI(
  post: Pick<Post, 'post_type' | 'ai_summary_markdown'> | null,
  force: boolean,
): boolean {
  return post != null && post.post_type === 'story' && (!post.ai_summary_markdown || force)
}

export async function wouldStoryPostCallOpenAI(postId: string, force: boolean): Promise<boolean> {
  const post = await getPostByAny(postId)
  return storyPostWouldCallOpenAI(post, force)
}

export async function processStoryPost(job: Job<StoryPostJobData>): Promise<unknown> {
  const post = await getPostByAny(job.data.post_id)
  if (!post) return null
  if (post.post_type !== 'story') return null
  // Idempotent: skip if summary already set, unless the job explicitly requests a refresh.
  if (!storyPostWouldCallOpenAI(post, job.data.force ?? false)) {
    const currentPost = await getPostByAny(post.id, { readOnly: false })
    if (!currentPost || currentPost.post_type !== 'story' || !currentPost.ai_summary_markdown) {
      return null
    }
    const moderation = await getPostModerationCompletion(currentPost.id, { readOnly: false })
    if (!moderation?.openai_omni_moderation_completed || !moderation.spam_detection_completed) {
      await updateStoryPostAgentResult(
        currentPost.id,
        currentPost.title ?? '',
        currentPost.ai_summary_markdown,
      )
    }
    return null
  }

  const postStory = await getPostStoryByPostId(post.id)
  if (!postStory) unrecoverable(new Error(`No post__stories row for post ${post.id}`))

  const story = await getStoryById(postStory!.story_id)
  if (!story) unrecoverable(new Error(`Story ${postStory!.story_id} not found`))

  // ast-grep-ignore: no-three-sequential-awaits -- inherently sequential: fetch items → run agent → write result
  const itemSummaries = await getStoryItemSummaries(story!.id)

  const agentResult = await callStoryPostAgent(story!, itemSummaries)
  await updateStoryPostAgentResult(post.id, post.title ?? '', agentResult.ai_summary_markdown)
  return agentResult
}

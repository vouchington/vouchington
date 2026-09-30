import {
  createOpenAIPostLLMModerationPrompt,
  createPostLLMModerator,
  getPostLLMModeratorBySlug,
  updateOpenAIPostLLMModerationPrompt,
  updatePostLLMModerator,
} from '@services/moderation'
import { getTopicByAny } from '@services/topics'
import { createSystemUser, createTestTopic, createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

export async function setupModeratorAndPrompt(user: PrivateUser) {
  const random = randomSuffix()
  const systemUser = await createSystemUser(`run-mod-system-${random}`)
  const moderator = await createPostLLMModerator(user, systemUser, `run-mod-${random}`)
  await updatePostLLMModerator(user, moderator.id, { active: true })
  const prompt = await createOpenAIPostLLMModerationPrompt(
    user,
    'openai',
    'gpt-5.4-nano',
    `Run moderation prompt ${random}`,
    moderator.id,
  )
  await updateOpenAIPostLLMModerationPrompt(user, prompt.id, { active: true })
  return { systemUser, moderator, prompt }
}

export async function setupModeratorBySlugAndPrompt(moderatorSlug: string) {
  const setupUser = await createTestUser()
  const random = randomSuffix()
  let moderator = await getPostLLMModeratorBySlug(moderatorSlug)
  if (!moderator) {
    const systemUser = await createSystemUser(`run-mod-system-${moderatorSlug}-${random}`)
    moderator = await createPostLLMModerator(setupUser, systemUser, moderatorSlug)
  }
  await updatePostLLMModerator(setupUser, moderator.id, { active: true })
  const prompt = await createOpenAIPostLLMModerationPrompt(
    setupUser,
    'openai',
    'gpt-5.4-nano',
    `Run moderation prompt ${moderatorSlug}-${random}`,
    moderator.id,
  )
  await updateOpenAIPostLLMModerationPrompt(setupUser, prompt.id, { active: true })
  return { user: setupUser, moderator, prompt }
}

export async function ensureTopicExists(topicSlug: string) {
  const existingTopic = await getTopicByAny(topicSlug)
  if (existingTopic) return
  await createTestTopic({ name: topicSlug, slug: topicSlug })
}

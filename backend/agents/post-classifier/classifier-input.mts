import {
  renderFixedClassifierRequest,
  sanitizeClassifierExternalContentParts,
} from '@agents/classifiers/safe-content'
import type {
  NoulClassifierBinding,
  ExecuteSingleCallClassifierDecisionInput,
} from '@agents/classifiers/types'
import { createPostModerationContent } from '@services/posts/content'
import type { resolvePostClassifierConfiguration } from '@services/post-classifier/configuration'
import {
  POST_CLASSIFIER_POLICY_PROMPT,
  POST_CLASSIFIER_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
} from '@voucha/types/entities/post-classifier'

type Configuration = NonNullable<
  Awaited<ReturnType<typeof resolvePostClassifierConfiguration>>
>['configuration']

export type PostClassifierInput = { inputSha256: Buffer } & Omit<
  ExecuteSingleCallClassifierDecisionInput,
  'batchId' | 'client' | 'signal'
>

/** Prepares remote input only; local detection and all persisted effects belong to the caller. */
export async function buildPostClassifierInput(
  post: Parameters<typeof createPostModerationContent>[0] & { id: string },
  configuration: Configuration,
): Promise<PostClassifierInput | null> {
  const remote = configuration.remote
  if (!remote) return null
  if (remote.prompt !== POST_CLASSIFIER_PROMPT || remote.questions.length === 0) {
    throw new Error('post classifier input must use the fixed prompt and nonempty remote set')
  }
  const enabled = new Set(
    configuration.enabledLabels.flatMap(label => (label.kind === 'remote' ? [label.slug] : [])),
  )
  const expected = POST_CLASSIFIER_REMOTE_QUESTIONS.filter(question =>
    enabled.has(question.logicalSlug),
  )
  if (remote.questions.length !== expected.length)
    throw new Error('post classifier questions do not match the enabled set')
  for (const [index, question] of remote.questions.entries()) {
    const canonical = expected[index]
    if (
      !canonical ||
      canonical.questionId !== question.questionId ||
      canonical.question !== question.question ||
      canonical.topicSlug !== question.topicSlug ||
      canonical.logicalSlug !== question.logicalSlug
    ) {
      throw new Error('post classifier question does not match the fixed catalog')
    }
  }
  const content = createPostModerationContent(post)
  if (!content.texts.some(text => text.trim()))
    throw new Error('post classifier requires nonempty post content')
  const external = await sanitizeClassifierExternalContentParts(
    [
      { content: `Title: ${content.title}`, isTitle: true },
      { content: `Content:\n${content.markdown}` },
      ...content.texts
        .slice(Number(Boolean(content.title)) + Number(Boolean(content.markdown)))
        .map(text => ({ content: text })),
    ],
    '\n\n',
    { source: 'post', contentType: 'moderation-content' },
  )
  const request = renderFixedClassifierRequest(
    POST_CLASSIFIER_POLICY_PROMPT,
    remote.questions.map(question => question.question),
    external,
  )
  const bindings: NoulClassifierBinding[] = remote.questions.map((question, index) => ({
    type: 'noul',
    questionId: question.questionId,
    question: request.questions[index]!,
    candidate: {
      candidateKind: 'topic',
      topicId: question.topicId,
      storedCandidateId: question.candidateId,
    },
  }))
  return {
    inputSha256: content.content_sha256,
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: { postId: post.id, rssFeedItemId: null },
    scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
    state: request.state,
    bindings,
  }
}

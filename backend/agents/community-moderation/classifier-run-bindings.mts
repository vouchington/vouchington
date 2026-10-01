import { renderClassifierCandidateQuestion } from '@agents/classifiers/safe-content'
import type { NoulClassifierBinding } from '@agents/classifiers/types'

/**
 * One yes/no question per community moderation prompt, in the order given, keyed by the prompt
 * id. The moderator's rule is the question's candidate text, sanitized as untrusted input before
 * it is substituted into the classifier's DB-owned question template.
 */
export async function buildCommunityModerationBindings(
  questionTemplate: string,
  prompts: readonly { id: string; text: string }[],
): Promise<NoulClassifierBinding[]> {
  return Promise.all(
    prompts.map(async prompt => ({
      type: 'noul' as const,
      questionId: prompt.id,
      question: await renderClassifierCandidateQuestion(questionTemplate, prompt.text),
      candidate: {
        candidateKind: 'community_prompt' as const,
        communityPromptId: prompt.id,
        storedCandidateId: null,
      },
    })),
  )
}

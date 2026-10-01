import { renderClassifierCandidateQuestion } from '@agents/classifiers/safe-content'
import type { NoulClassifierBinding } from '@agents/classifiers/types'

/**
 * One yes/no question per candidate topic, in the order given, keyed by the topic id. The single
 * place a tagging question is rendered, so a production run and the credentialed golden
 * regression set ask the same thing from the same classifier prompt.
 */
export async function buildAutotaggerBindings(
  prompt: string,
  topics: readonly { topicId: string; name: string }[],
): Promise<NoulClassifierBinding[]> {
  return Promise.all(
    topics.map(async topic => ({
      type: 'noul' as const,
      questionId: topic.topicId,
      question: await renderClassifierCandidateQuestion(prompt, topic.name),
      candidate: {
        candidateKind: 'topic' as const,
        topicId: topic.topicId,
        storedCandidateId: null,
      },
    })),
  )
}

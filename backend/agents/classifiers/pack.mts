import type {
  StructuredDecisionQuestion,
  StructuredDecisionRequest,
} from '@modules/structured-decisions'
import { requestFitsClassifierContext } from './context-policy.mts'
import type { ClassifierContextPolicy } from './types.mts'

export function packClassifierDecisionQuestions(
  state: string,
  questions: readonly StructuredDecisionQuestion[],
  contextPolicy: ClassifierContextPolicy,
): readonly StructuredDecisionRequest[] {
  const shards: StructuredDecisionQuestion[][] = []
  for (const question of questions) {
    if (!requestFitsClassifierContext({ state, questions: [question] }, contextPolicy))
      throw new Error(
        `Classifier question ${question.id} cannot fit within the active context limit`,
      )
    const shard = shards.find(existing =>
      requestFitsClassifierContext({ state, questions: [...existing, question] }, contextPolicy),
    )
    if (shard) shard.push(question)
    else shards.push([question])
  }
  return shards.map(shard => ({ state, questions: shard }))
}

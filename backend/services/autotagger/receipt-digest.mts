import { createHash } from 'node:crypto'

/**
 * Bumped whenever the composition of `computeAutotaggerReceiptDigest` changes.
 * A version bump makes every prior digest for a subject non-matching, so the
 * next run creates a brand-new receipt/batch identity instead of colliding
 * with (or replaying) a receipt hashed under the old composition.
 */
export const AUTOTAGGER_RECEIPT_DIGEST_VERSION = 1

export type AutotaggerReceiptDigestQuestion = {
  questionId: string
  question: string
  candidateId: string
}

export type AutotaggerReceiptDigestInput = {
  state: string
  questions: readonly AutotaggerReceiptDigestQuestion[]
  scopeCategory: 'global' | 'community_ai'
  scopeCommunityId: string | null
  effectiveCap: number
  classifierId: string
  promptVersionId: string
  modelProvider: string
  modelName: string
}

/**
 * Hashes the exact sanitized request identity for a C6 autotagger receipt:
 * the wrapped state, the rendered candidate question IDs/text in request
 * order, scope, the effective candidate-set cap, the classifier/prompt
 * revision, and the active provider/model revision. Changing any of these
 * changes the digest, which creates a new receipt row and a new immutable
 * batch ID rather than reusing or mutating an existing one (see
 * docs/overview/architecture/structured-decisions.md).
 */
export function computeAutotaggerReceiptDigest(input: AutotaggerReceiptDigestInput): Buffer {
  const canonical = JSON.stringify({
    digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
    state: input.state,
    questions: input.questions.map(question => ({
      questionId: question.questionId,
      question: question.question,
      candidateId: question.candidateId,
    })),
    scopeCategory: input.scopeCategory,
    scopeCommunityId: input.scopeCommunityId,
    effectiveCap: input.effectiveCap,
    classifierId: input.classifierId,
    promptVersionId: input.promptVersionId,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
  })
  return createHash('sha256').update(canonical, 'utf8').digest()
}

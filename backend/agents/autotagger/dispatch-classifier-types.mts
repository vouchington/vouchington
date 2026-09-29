import type { AutotaggerReceiptSubject } from '@services/autotagger'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'

export type AutotaggerClassifierCandidate = { topicId: string; name: string }

export type AutotaggerClassifierDispatchInput = {
  subject: AutotaggerReceiptSubject
  state: ClassifierSafeText
  candidates: readonly AutotaggerClassifierCandidate[]
  // The resolved tier/discoverability cap the caller used to bound its candidate search -- kept
  // distinct from `candidates.length` because the digest must change when this cap changes even if
  // the *found* candidate set happens to stay identical (e.g. a plan upgrade raising the cap from 3
  // to 10 while embedding search still only turns up the same 2 topics must still be treated as a
  // new request, not a replay of the free-tier decision).
  maxCandidates: number
}

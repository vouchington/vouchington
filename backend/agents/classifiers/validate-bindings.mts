import type { ActiveClassifierConfiguration } from '@services/classifiers'
import { isUUID } from '@modules/utils/ids'
import { candidatesForBinding, classifierCandidateKey } from './bindings.mts'
import { isClassifierChoiceKey } from './safe-content.mts'
import type {
  ChoiceClassifierBinding,
  ClassifierDecisionCandidate,
  ExecuteClassifierDecisionInput,
} from './types.mts'

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertBindingsMatchConfiguration(
  input: ExecuteClassifierDecisionInput,
  configuration: ActiveClassifierConfiguration,
): void {
  assertConfigurationIdentity(input, configuration)
  assertSubjectAndScope(input, configuration)
  assertBindingSet(input, configuration)
}

export function assertClassifierDecisionIds(input: ExecuteClassifierDecisionInput): void {
  if (!UUID_V7_PATTERN.test(input.batchId))
    throw new Error('Classifier decision batch ID must be UUIDv7')
  const ids = [input.classifierId, input.promptVersionId]
  if (input.subject.postId) ids.push(input.subject.postId)
  if (input.subject.rssFeedItemId) ids.push(input.subject.rssFeedItemId)
  if (input.scope.scopeCommunityId) ids.push(input.scope.scopeCommunityId)
  for (const binding of input.bindings) {
    for (const candidate of candidatesForBinding(binding)) {
      ids.push(candidate.candidateKind === 'topic' ? candidate.topicId : candidate.storyId)
      if (candidate.storedCandidateId) ids.push(candidate.storedCandidateId)
    }
  }
  if (ids.some(id => !isUUID(id))) throw new Error('Classifier decision durable IDs must be UUIDs')
}

function assertConfigurationIdentity(
  input: ExecuteClassifierDecisionInput,
  configuration: ActiveClassifierConfiguration,
): void {
  if (input.classifierId !== configuration.classifierId)
    throw new Error('Active classifier configuration does not match the requested classifier')
  if (input.promptVersionId !== configuration.promptVersionId)
    throw new Error('Active classifier prompt version changed before decision execution')
  if (configuration.primitive === 'score')
    throw new Error('Classifier Score persistence is unsupported without a scalar projection')
  if (configuration.primitive !== input.bindings[0]?.type)
    throw new Error('Classifier bindings do not match the active classifier primitive')
  if (configuration.modelProvider !== input.contextPolicy.transport)
    throw new Error('Classifier context policy transport does not match the active model provider')
  if (configuration.modelName !== input.contextPolicy.model)
    throw new Error('Classifier context policy model does not match the active model')
  if (input.state.trim().length === 0) throw new Error('Classifier decision state is required')
  if (input.bindings.length === 0)
    throw new Error('Classifier decision requires at least one binding')
}

function assertSubjectAndScope(
  input: ExecuteClassifierDecisionInput,
  configuration: ActiveClassifierConfiguration,
): void {
  if (Boolean(input.subject.postId) === Boolean(input.subject.rssFeedItemId))
    throw new Error('Classifier decision requires exactly one subject')
  if (configuration.candidateKind === 'topic' && input.subject.postId === null)
    throw new Error('Topic classifiers require a post subject')
  if (configuration.candidateKind === 'story' && input.subject.rssFeedItemId === null)
    throw new Error('Story classifiers require an RSS feed item subject')
  if (input.scope.scopeCategory === 'global' && input.scope.scopeCommunityId !== null)
    throw new Error('Global classifier decisions cannot name a community')
  if (input.scope.scopeCategory === 'community_ai' && !input.scope.scopeCommunityId)
    throw new Error('Community classifier decisions require a community')
}

function assertBindingSet(
  input: ExecuteClassifierDecisionInput,
  configuration: ActiveClassifierConfiguration,
): void {
  const questionIds = new Set<string>()
  const candidateKeys = new Set<string>()
  const storedCandidateIds = new Set<string>()
  for (const binding of input.bindings) {
    if (binding.type !== configuration.primitive)
      throw new Error('Classifier decision cannot mix question primitives')
    if (binding.questionId.trim().length === 0 || binding.question.trim().length === 0)
      throw new Error('Classifier bindings require a question ID and question')
    if (questionIds.has(binding.questionId))
      throw new Error('Classifier decision cannot duplicate question IDs')
    questionIds.add(binding.questionId)
    for (const candidate of candidatesForBinding(binding)) {
      assertCandidateIdentity(candidate)
      if (candidate.candidateKind !== configuration.candidateKind)
        throw new Error('Classifier decision cannot mix candidate kinds')
      const key = classifierCandidateKey(candidate)
      if (candidateKeys.has(key))
        throw new Error('Classifier decision cannot duplicate concrete candidates')
      candidateKeys.add(key)
      if (candidate.storedCandidateId) {
        if (storedCandidateIds.has(candidate.storedCandidateId))
          throw new Error('Classifier decision cannot duplicate stored candidates')
        storedCandidateIds.add(candidate.storedCandidateId)
      }
    }
    if (binding.type === 'choice') assertChoiceBinding(binding)
  }
}

function assertCandidateIdentity(candidate: ClassifierDecisionCandidate): void {
  const entityId = candidate.candidateKind === 'topic' ? candidate.topicId : candidate.storyId
  if (entityId.trim().length === 0)
    throw new Error('Classifier candidates require a concrete entity ID')
  if (candidate.storedCandidateId !== null && candidate.storedCandidateId.trim().length === 0)
    throw new Error('Stored classifier candidate IDs cannot be empty')
}

function assertChoiceBinding(binding: ChoiceClassifierBinding): void {
  if (binding.criteria.length < 2)
    throw new Error('Choice classifier bindings require at least two criteria')
  const criteria = new Set<string>()
  let candidateCount = 0
  let unboundCount = 0
  for (const criterion of binding.criteria) {
    if (!isClassifierChoiceKey(criterion.criterion) || criteria.has(criterion.criterion))
      throw new Error('Choice classifier criteria must be unique opaque keys')
    criteria.add(criterion.criterion)
    if (criterion.candidate) candidateCount += 1
    else unboundCount += 1
  }
  if (candidateCount === 0)
    throw new Error('Choice classifier bindings require a candidate criterion')
  if (unboundCount > 1)
    throw new Error('Choice classifier bindings allow at most one unbound criterion')
}

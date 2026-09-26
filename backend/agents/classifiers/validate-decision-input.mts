import type { ActiveClassifierConfiguration } from '@services/classifiers'
import { isUUID } from '@modules/utils/ids'
import { candidatesForBinding, classifierCandidateEntityId } from './bindings.mts'
import type { ClassifierDecisionRequestInput } from './types.mts'

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertClassifierDecisionIds(input: ClassifierDecisionRequestInput): void {
  if (!UUID_V7_PATTERN.test(input.batchId))
    throw new Error('Classifier decision batch ID must be UUIDv7')
  const ids = [input.classifierId, input.promptVersionId]
  if (input.subject.postId) ids.push(input.subject.postId)
  if (input.subject.rssFeedItemId) ids.push(input.subject.rssFeedItemId)
  if (input.scope.scopeCommunityId) ids.push(input.scope.scopeCommunityId)
  for (const binding of input.bindings) {
    for (const candidate of candidatesForBinding(binding)) {
      ids.push(classifierCandidateEntityId(candidate))
      if (candidate.storedCandidateId) ids.push(candidate.storedCandidateId)
    }
  }
  if (ids.some(id => !isUUID(id))) throw new Error('Classifier decision durable IDs must be UUIDs')
}

export function assertConfigurationIdentity(
  input: ClassifierDecisionRequestInput,
  configuration: ActiveClassifierConfiguration,
): void {
  if (input.classifierId !== configuration.classifierId)
    throw new Error('Active classifier configuration does not match the requested classifier')
  if (input.promptVersionId !== configuration.promptVersionId)
    throw new Error('Active classifier prompt version changed before decision execution')
  if (configuration.primitive === 'score')
    throw new Error('Classifier Score persistence is unsupported without a scalar projection')
  if (input.bindings.length === 0)
    throw new Error('Classifier decision requires at least one binding')
  if (configuration.primitive !== input.bindings[0]?.type)
    throw new Error('Classifier bindings do not match the active classifier primitive')
  // Single-call classifier families (no exact context measurer) omit
  // `contextPolicy` entirely; there is nothing to cross-check it against.
  if (input.contextPolicy) {
    if (configuration.modelProvider !== input.contextPolicy.transport)
      throw new Error(
        'Classifier context policy transport does not match the active model provider',
      )
    if (configuration.modelName !== input.contextPolicy.model)
      throw new Error('Classifier context policy model does not match the active model')
  }
  if (input.state.trim().length === 0) throw new Error('Classifier decision state is required')
}

export function assertSubjectAndScope(
  input: ClassifierDecisionRequestInput,
  configuration: ActiveClassifierConfiguration,
): void {
  if (Boolean(input.subject.postId) === Boolean(input.subject.rssFeedItemId))
    throw new Error('Classifier decision requires exactly one subject')
  if (configuration.candidateKind === 'story' && input.subject.rssFeedItemId === null)
    throw new Error('Story classifiers require an RSS feed item subject')
  if (input.scope.scopeCategory === 'global' && input.scope.scopeCommunityId !== null)
    throw new Error('Global classifier decisions cannot name a community')
  if (input.scope.scopeCategory === 'community_ai' && !input.scope.scopeCommunityId)
    throw new Error('Community classifier decisions require a community')
}

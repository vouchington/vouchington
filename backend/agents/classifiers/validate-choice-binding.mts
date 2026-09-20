import { isClassifierChoiceKey } from './safe-content.mts'
import type { ChoiceClassifierBinding } from './types.mts'

export function assertChoiceBinding(binding: ChoiceClassifierBinding): void {
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

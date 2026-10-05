import {
  persistClassifierDecision,
  type PersistClassifierDecisionResult,
} from '@services/classifiers'
import { prepareSingleCallClassifierDecision } from './prepare-single-call.mts'
import type {
  ExecuteClassifierDecisionDependencies,
  ExecuteSingleCallClassifierDecisionInput,
} from './types.mts'

/**
 * A sharding-free twin of `executeClassifierDecision` for classifier
 * families with no exact context measurer (see
 * docs/overview/architecture/structured-decisions.md). It sends every
 * binding as one request instead of packing shards against a token budget,
 * and lets an oversized-context provider rejection surface as an ordinary
 * `StructuredDecisionError` for the caller's own retry/queue semantics to
 * handle — it makes no token estimate and never approximates one.
 * @public Retained provisionally under issue #1360 and documented in
 * `docs/overview/architecture/structured-decisions.md`; external production use is unconfirmed
 * and this export may be removed after intended-use review.
 */
export async function executeSingleCallClassifierDecision(
  input: ExecuteSingleCallClassifierDecisionInput,
  dependencies: ExecuteClassifierDecisionDependencies = {},
): Promise<PersistClassifierDecisionResult> {
  const persist = dependencies.persistClassifierDecision ?? persistClassifierDecision
  return persist(await prepareSingleCallClassifierDecision(input, dependencies))
}

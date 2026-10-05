import {
  approvedPostRequestEligibility,
  lockApprovedPostClassifierInput,
  type ClassifierRunAdapter,
} from '@services/classifier-runs'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { resolvePostClassifierConfiguration } from './configuration.mts'
import { applyPostClassifierEffects, type PostClassifierEffects } from './effects.mts'
import {
  persistPostClassifierLocalOutcome,
  readPostClassifierLocalOutcome,
  validatePostClassifierLocal,
  type PostClassifierLocalOutcome,
} from './local-outcome.mts'
import { toResolvedClassifierRun, type PostClassifierConfiguration } from './run-configuration.mts'

export type PostClassifierRunAdapter = ClassifierRunAdapter<
  PostClassifierConfiguration,
  PostClassifierLocalOutcome,
  PostClassifierEffects
>

/**
 * The C5 adapter: how an approved post's current input is read and its configuration resolved, plus
 * how the durable outcomes become the post's topic relations and the classifier's relation votes.
 * The shared classifier-run lifecycle owns receipt, lease, attempts, terminal failure, completion,
 * supersession and sweep.
 */
export function createPostClassifierRunAdapter(
  detectorPackageVersion: string,
): PostClassifierRunAdapter {
  if (!detectorPackageVersion) throw new Error('Detector package version is required')
  return {
    slug: POST_CLASSIFIER_SLUG,
    lockCurrent: lockApprovedPostClassifierInput,
    async resolve(_subject, current, query) {
      const resolved = await resolvePostClassifierConfiguration(current.communityId, {
        detectorPackageVersion,
        query,
      })
      return resolved && toResolvedClassifierRun(resolved)
    },
    requestEligibility: () => approvedPostRequestEligibility(),
    validateLocal: validatePostClassifierLocal,
    persistLocal: persistPostClassifierLocalOutcome,
    readLocal: readPostClassifierLocalOutcome,
    applyEffects: applyPostClassifierEffects,
  }
}

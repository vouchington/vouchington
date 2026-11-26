import { runRoundTripShapeScenarios } from './run-scenarios/round-trip-shapes.mts'
import { runPostProvenanceCapacityScenario } from './run-scenarios/post-provenance-capacity.mts'
import { runRequestContextFoldScenarios } from './run-scenarios/request-context-folds.mts'
import { runCommunityRoundTripScenarios } from './run-scenarios/community-round-trips.mts'
import { runSessionLimitScenarios } from './run-scenarios/session-limits.mts'
import { runImageDeliveryFoldScenarios } from './run-scenarios/image-delivery-folds.mts'
import { runUserProfileRoundTripScenarios } from './run-scenarios/user-profile-round-trips.mts'

export const ROUND_TRIPS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runRoundTripShapeScenarios,
  runPostProvenanceCapacityScenario,
  runRequestContextFoldScenarios,
  runCommunityRoundTripScenarios,
  runSessionLimitScenarios,
  runImageDeliveryFoldScenarios,
  runUserProfileRoundTripScenarios,
]

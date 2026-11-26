import { runSearchAndFacetScenarios } from './run-scenarios/search-and-facets.mts'
import { runSpamSignalScenarios } from './run-scenarios/spam-signals.mts'
import { runOAuthClientVerificationScenarios } from './run-scenarios/oauth-client-verification.mts'
import { runFollowerDistributionScenarios } from './run-scenarios/follower-distributions.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runQueryShapeNoOpScenarios } from './run-scenarios/query-shape-no-ops.mts'
import { runViewDrivenReadScenarios } from './run-scenarios/view-driven-reads.mts'

export const SEARCH_ENTITIES_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runSearchAndFacetScenarios,
  runSpamSignalScenarios,
  runOAuthClientVerificationScenarios,
  runFollowerDistributionScenarios,
  runEntityAndCommunityScenarios,
  runQueryShapeNoOpScenarios,
  runViewDrivenReadScenarios,
]

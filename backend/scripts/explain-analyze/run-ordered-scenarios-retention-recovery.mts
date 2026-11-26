import { runRetentionStagePageScenarios } from './run-scenarios/retention-stage-pages.mts'
import { runOAuthFriendResolutionCapacityScenarios } from './run-scenarios/oauth-friend-resolution-capacity.mts'

export const RETENTION_RECOVERY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runRetentionStagePageScenarios,
  runOAuthFriendResolutionCapacityScenarios,
]

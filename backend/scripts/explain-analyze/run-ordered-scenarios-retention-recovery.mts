import { runRetentionStagePageScenarios } from './run-scenarios/retention-stage-pages.mts'
import { runOAuthFriendResolutionCapacityScenarios } from './run-scenarios/oauth-friend-resolution-capacity.mts'
import { runCopyrightRestoreIntentCapacityScenario } from './run-scenarios/copyright-restore-intents.mts'

export const RETENTION_RECOVERY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runCopyrightRestoreIntentCapacityScenario,
  runRetentionStagePageScenarios,
  runOAuthFriendResolutionCapacityScenarios,
]

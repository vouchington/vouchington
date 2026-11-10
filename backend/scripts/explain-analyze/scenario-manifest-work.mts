import { RETENTION_WORK_SCENARIOS } from './scenario-manifest-work-retention.mts'
import { MEMBERSHIP_WORK_SCENARIOS } from './scenario-manifest-work-membership.mts'
import { MAINTENANCE_WORK_SCENARIOS } from './scenario-manifest-work-maintenance.mts'
import { AI_USAGE_SCENARIO_IDS } from './ai-usage-scenario-ids.mts'

export const BOUNDED_WORK_SCENARIOS = [
  ...RETENTION_WORK_SCENARIOS,
  ...MEMBERSHIP_WORK_SCENARIOS,
  ...MAINTENANCE_WORK_SCENARIOS,
  ...AI_USAGE_SCENARIO_IDS,
] as const

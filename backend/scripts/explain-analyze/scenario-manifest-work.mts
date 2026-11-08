import { HACKER_NEWS_SCALE_SCENARIO_IDS } from './hacker-news-scale-scenario-ids.mts'
import { RETENTION_WORK_SCENARIOS } from './scenario-manifest-work-retention.mts'
import { MEMBERSHIP_WORK_SCENARIOS } from './scenario-manifest-work-membership.mts'
import { MAINTENANCE_WORK_SCENARIOS } from './scenario-manifest-work-maintenance.mts'

export const BOUNDED_WORK_SCENARIOS = [
  ...HACKER_NEWS_SCALE_SCENARIO_IDS,
  ...RETENTION_WORK_SCENARIOS,
  ...MEMBERSHIP_WORK_SCENARIOS,
  ...MAINTENANCE_WORK_SCENARIOS,
] as const

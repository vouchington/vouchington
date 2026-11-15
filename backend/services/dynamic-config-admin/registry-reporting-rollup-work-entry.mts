import {
  reportingRollupWorkConfig,
  reportingRollupWorkMaxValues,
} from '@services/reporting-daily-rollups/work-limits'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

export const reportingRollupWorkRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'reporting-rollup-work-config',
  config: reportingRollupWorkConfig,
  maxValues: reportingRollupWorkMaxValues,
  label: 'Daily reporting materialization',
  descriptions: {
    cleanup_rows: 'Expired moderator workload cohorts retired by one ordered reporting job.',
    days_per_job: 'Completed UTC source days replaced by one ordered reporting job.',
  },
})

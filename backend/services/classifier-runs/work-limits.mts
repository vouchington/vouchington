import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  discovery_page_size: 100,
  usage_report_max_runs: 20_000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const classifierRunsWorkMaxValues = {
  discovery_page_size: 1000,
  usage_report_max_runs: 200_000,
}

export const classifierRunsWorkConfig = new DynamicConfig({
  key: 'classifier-runs-work-config',
  fieldTypes: {
    discovery_page_size: 'number',
    usage_report_max_runs: 'number',
  },
  defaultFields,
})

export function getClassifierRunsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(classifierRunsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: classifierRunsWorkMaxValues[field],
  })
}

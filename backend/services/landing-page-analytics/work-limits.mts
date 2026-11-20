import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  utm_sources_listed: 20,
}

/** Hard ceilings for the current runtime configuration contract. */
export const landingPageAnalyticsWorkMaxValues = {
  utm_sources_listed: 200,
}

export const landingPageAnalyticsWorkConfig = new DynamicConfig({
  key: 'landing-page-analytics-work-config',
  fieldTypes: {
    utm_sources_listed: 'number',
  },
  defaultFields,
})

export function getLandingPageAnalyticsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(landingPageAnalyticsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: landingPageAnalyticsWorkMaxValues[field],
  })
}

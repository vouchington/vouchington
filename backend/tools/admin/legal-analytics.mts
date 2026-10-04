import { adminCopyrightReadTools } from './copyright-reads.mts'
import { adminLegalTools } from './legal-analytics-legal.mts'
import { adminBusinessAnalyticsTools } from './legal-analytics-business.mts'
export const adminLegalAnalyticsTools = [
  ...adminLegalTools,
  ...adminCopyrightReadTools,
  ...adminBusinessAnalyticsTools,
]

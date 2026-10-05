import { adminCopyrightReadTools } from './copyright-reads.mts'
import { adminCopyrightDecisionIntakeTools } from './copyright-decisions-intake.mts'
import { adminCopyrightDecisionCaseTools } from './copyright-decisions-cases.mts'
import { adminCopyrightDecisionOperationTools } from './copyright-decisions-operations.mts'
import { adminLegalTools } from './legal-analytics-legal.mts'
import { adminBusinessAnalyticsTools } from './legal-analytics-business.mts'
export const adminLegalAnalyticsTools = [
  ...adminLegalTools,
  ...adminCopyrightReadTools,
  ...adminCopyrightDecisionIntakeTools,
  ...adminCopyrightDecisionCaseTools,
  ...adminCopyrightDecisionOperationTools,
  ...adminBusinessAnalyticsTools,
]

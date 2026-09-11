import part0 from './extracted-admin/admin/adminModerationButton.ts'
import part1 from './extracted-admin/admin/adminPagination.ts'
import part2 from './extracted-admin/admin/adminReportRow.ts'
import part3 from './extracted-admin/admin/landingPageAnalyticsCard.ts'
import part4 from './extracted-admin/admin/membershipRefundChargeList.ts'
import part5 from './extracted-admin/admin/membershipRefundForm.ts'
import part6 from './extracted-admin/admin/membershipRefundPanel.ts'
import part7 from './extracted-admin/admin/reportClusterActions.ts'
import part8 from './extracted-admin/admin/reportClusterCard.ts'
import part9 from './extracted-admin/admin/reportClusterDetail.ts'
import part10 from './extracted-admin/admin/reportClusterIndicators.ts'
import part11 from './extracted-admin/admin/reportDuplicateClusterCard.ts'
import part12 from './extracted-admin/admin/reportRowWarnButton.ts'
import part13 from './extracted-admin/admin/reportsClient.ts'
import part14 from './extracted-admin/admin/reportsClusteredClient.ts'
import part15 from './extracted-admin/admin/reportsClusteredList.ts'
import part16 from './extracted-admin/admin/topicClaimReview.ts'
import part17 from './extracted-admin/admin/userAdminPanel.ts'
import part18 from './extracted-admin/admin/userAdminWarnings.ts'
import part19 from './extracted-admin/agents.ts'
import part20 from './extracted-admin/appeals.ts'
import part21 from './extracted-admin/crm.ts'
import part22 from './extracted-admin/curatedAsides.ts'
import part23 from './extracted-admin/admin/identityVerificationAttemptGrant.ts'
import part24 from './extracted-admin/dynamicConfig.ts'
import part25 from './extracted-admin/flags.ts'
import part26 from './extracted-admin/growth.ts'
import part27 from './extracted-admin/moderation.ts'
import part28 from './extracted-admin/moderationAnalytics.ts'
import part29 from './extracted-admin/postgresql.ts'
import part30 from './extracted-admin/queues.ts'
import part31 from './extracted-admin/reports.ts'
import part32 from './extracted-admin/valkey.ts'

function merge(parts: Array<Record<string, unknown>>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const part of parts) mergeInto(output, part)
  return output
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default merge([
  part0,
  part1,
  part2,
  part3,
  part4,
  part5,
  part6,
  part7,
  part8,
  part9,
  part10,
  part11,
  part12,
  part13,
  part14,
  part15,
  part16,
  part17,
  part18,
  part19,
  part20,
  part21,
  part22,
  part23,
  part24,
  part25,
  part26,
  part27,
  part28,
  part29,
  part30,
  part31,
  part32,
])

import type { Tool } from '@services/openai-agents/tool-types'
import { adminAccountControlTools } from '../admin/account-controls.mts'
import { adminAgentVoteTools } from '../admin/agent-votes.mts'
import { adminAppealsLifecycleTools } from '../admin/appeals-lifecycle.mts'
import { adminAppealsReadTools } from '../admin/appeals-reads.mts'
import { resolveModerationAppealTool } from '../admin/appeals-resolution.mts'
import { adminDisputesLifecycleTools } from '../admin/disputes-lifecycle.mts'
import { adminDisputesReadTools } from '../admin/disputes-reads.mts'
import { resolveReviewDisputeTool } from '../admin/disputes-resolution.mts'
import { adminEditorialCategoryTools } from '../admin/editorial-categories.mts'
import { adminEditorialCrawlerTools } from '../admin/editorial-crawlers.mts'
import { adminEditorialReadTools } from '../admin/editorial-reads.mts'
import { adminLegalAnalyticsTools } from '../admin/legal-analytics.mts'
import { adminReportIntegrityFlagTools } from '../admin/report-integrity-flags.mts'
import { adminReportIntegrityPenaltyTools } from '../admin/report-integrity-penalties.mts'
import { adminSiteOperationsTools } from '../admin/site-operations.mts'
import { adminUserContextTools } from '../admin/user-context.mts'
import { adminVoteIntegrityFlagTools } from '../admin/vote-integrity-flags.mts'
import { adminVoteIntegrityPenaltyTools } from '../admin/vote-integrity-penalties.mts'
import { adminWarningTools } from '../admin/warnings.mts'
import { createMergedTool } from '../create-merged-tool.mts'

type OptionPair = readonly [option: string, source: string]
const group = (name: string, ...options: readonly OptionPair[]) => ({ name, options })

const groups = [
  group(
    'set_rss_category_rejection',
    ['reject', 'reject_rss_category'],
    ['restore', 'restore_rss_category'],
  ),
  group('read_crawler', ['list', 'list_crawlers'], ['get', 'get_crawler']),
  group(
    'read_editorial_job',
    ['import_batch', 'get_import_batch'],
    ['article_sync', 'get_article_sync'],
  ),
  group(
    'read_user_moderation',
    ['warnings', 'list_user_warnings'],
    ['context', 'get_user_moderation_context'],
    ['notes', 'list_user_moderator_notes'],
  ),
  group('record_user_moderation', ['warning', 'issue_user_warning'], ['note', 'add_user_mod_note']),
  group('set_user_suspension', ['suspend', 'suspend_user'], ['unsuspend', 'unsuspend_user']),
  group(
    'configure_user_vote_weight',
    ['set', 'set_user_vote_weight'],
    ['clear', 'clear_user_vote_weight'],
  ),
  group(
    'read_report_integrity',
    ['flags', 'list_report_integrity_flags'],
    ['penalties', 'list_report_abuse_penalties'],
  ),
  group(
    'review_integrity_flag',
    ['report', 'review_report_integrity_flag'],
    ['vote', 'review_vote_integrity_flag'],
  ),
  group(
    'apply_integrity_penalty',
    ['report_abuse', 'apply_report_abuse_penalty'],
    ['vote_ring', 'apply_vote_ring_penalty'],
  ),
  group(
    'lift_integrity_penalty',
    ['report_abuse', 'lift_report_abuse_penalty'],
    ['vote_ring', 'lift_vote_ring_penalty'],
  ),
  group(
    'read_vote_integrity',
    ['flags', 'list_vote_integrity_flags'],
    ['penalties', 'list_vote_ring_penalties'],
  ),
  group(
    'configure_agent_moderation_vote',
    ['set', 'set_agent_moderation_vote'],
    ['clear', 'clear_agent_moderation_vote'],
  ),
  group(
    'read_moderation_appeal',
    ['list', 'list_moderation_appeals'],
    ['get', 'get_moderation_appeal'],
  ),
  group('read_review_dispute', ['list', 'list_review_disputes'], ['get', 'get_review_dispute']),
  group(
    'draft_review_response',
    ['appeal', 'draft_appeal_response'],
    ['dispute', 'draft_dispute_response'],
  ),
  group(
    'approve_review_response',
    ['appeal', 'approve_appeal_response'],
    ['dispute', 'approve_dispute_response'],
  ),
  group(
    'deliver_review_response',
    ['appeal', 'deliver_appeal_response'],
    ['dispute', 'deliver_dispute_response'],
  ),
  group(
    'rerun_review_resolution_draft',
    ['appeal', 'rerun_appeal_resolution_draft'],
    ['dispute', 'rerun_dispute_resolution_draft'],
  ),
  group(
    'resolve_review_case',
    ['appeal', 'resolve_moderation_appeal'],
    ['dispute', 'resolve_review_dispute'],
  ),
  group(
    'review_copyright_email_intake',
    ['approve', 'approve_copyright_email_intake'],
    ['reject', 'reject_copyright_email_intake'],
  ),
  group(
    'review_copyright_email_correspondence',
    ['admit', 'admit_copyright_email_correspondence'],
    ['reject', 'reject_copyright_email_correspondence'],
  ),
  group(
    'replay_copyright_intent',
    ['delivery', 'replay_copyright_delivery_intent'],
    ['action', 'replay_copyright_action_intent'],
  ),
  group(
    'read_admin_metrics',
    ['growth', 'get_growth_metrics'],
    ['ai_costs', 'get_ai_costs'],
    ['queue_stats', 'get_queue_stats'],
  ),
  group(
    'read_queue_catalog',
    ['queues', 'list_queues'],
    ['scheduled_jobs', 'list_scheduled_jobs'],
    ['backfills', 'list_backfills'],
  ),
  group('run_operational_job', ['scheduled', 'run_scheduled_job'], ['backfill', 'run_backfill']),
  group(
    'read_dynamic_config',
    ['namespaces', 'list_dynamic_config_namespaces'],
    ['namespace', 'get_dynamic_config_namespace'],
    ['history', 'list_dynamic_config_history'],
  ),
]

const adminTools = [
  ...adminAccountControlTools,
  ...adminAgentVoteTools,
  ...adminAppealsLifecycleTools,
  ...adminAppealsReadTools,
  resolveModerationAppealTool,
  ...adminDisputesLifecycleTools,
  ...adminDisputesReadTools,
  resolveReviewDisputeTool,
  ...adminEditorialCategoryTools,
  ...adminEditorialCrawlerTools,
  ...adminEditorialReadTools,
  ...adminLegalAnalyticsTools,
  ...adminReportIntegrityFlagTools,
  ...adminReportIntegrityPenaltyTools,
  ...adminSiteOperationsTools,
  ...adminUserContextTools,
  ...adminVoteIntegrityFlagTools,
  ...adminVoteIntegrityPenaltyTools,
  ...adminWarningTools,
]
const toolsByName = new Map(adminTools.map(tool => [tool.schema.name, tool]))

function sourceTool(name: string): Tool<never> {
  const tool = toolsByName.get(name)
  if (!tool) throw new Error(`missing admin merge source ${name}`)
  return tool
}

const replaced = groups.flatMap(entry => entry.options.map(([, source]) => source))
if (new Set(replaced).size !== replaced.length) throw new Error('duplicate admin merge source')

export const replacedAdminToolNames = new Set(replaced)

export const adminMergedGroups = groups.map(entry => ({
  name: entry.name,
  options: entry.options.map(([option, source]) => ({ option, source: sourceTool(source) })),
}))

function title(name: string): string {
  return name
    .split('_')
    .map(word => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

export const adminMergedTools = adminMergedGroups.map(entry =>
  createMergedTool(
    entry.name,
    title(entry.name),
    entry.options.map(option => ({ option: option.option, source: option.source })),
  ),
)

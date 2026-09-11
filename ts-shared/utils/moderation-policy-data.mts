/**
 * Raw policy registry data — imported by moderation-policy.mts.
 *
 * This file holds only the `MODERATION_POLICY` array and the primitive
 * constant/type exports it depends on. Derived types and runtime arrays
 * live in moderation-policy.mts.
 *
 * Keep in sync with ToS §4 AND articles/how-moderation-works.md.
 */

export const MODERATION_REPORT_ENTITY_TYPES = [
  'rss_feed_item',
  'post',
  'comment',
  'user',
  'url_hostname',
] as const
export type ModerationReportEntityType = (typeof MODERATION_REPORT_ENTITY_TYPES)[number]

export const MODERATION_POLICY_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type ModerationPolicySeverity = (typeof MODERATION_POLICY_SEVERITIES)[number]

export const MODERATION_JUDGEMENT_ACTIONS = ['no_action', 'warn', 'remove', 'escalate'] as const
export type ModerationJudgementAction = (typeof MODERATION_JUDGEMENT_ACTIONS)[number]

export { MODERATION_APPEAL_ACTIONS, type ModerationAppealAction } from './moderation-catalogs.mts'

/**
 * Strict discriminated union for registry entries.
 *
 * Enforces at compile time that:
 *   - report+AI or AI-only entries have no guidance field
 *   - report-only entries always carry guidance (used in AI prompts)
 *   - no entry can be both isReportReason: false and isAiCategory: false
 */
export type PolicyEntry = {
  readonly key: string
  readonly label: string
  readonly surfaces: readonly ModerationReportEntityType[]
  readonly severity: ModerationPolicySeverity
  readonly appealEligible: boolean
  readonly recommendedAction: ModerationJudgementAction
  readonly description: string
} & (
  | { readonly isReportReason: true; readonly isAiCategory: true }
  | { readonly isReportReason: false; readonly isAiCategory: true }
  | { readonly isReportReason: true; readonly isAiCategory: false; readonly guidance: string }
)

/**
 * Ordered policy registry.
 *
 * Order: [4 common: report + AI] → [5 AI-only] → [2 report-only].
 * This ensures:
 *   filter(isReportReason).map(e => e.key) === MODERATION_REPORT_REASONS (report order)
 *   filter(isAiCategory).map(e => e.key)   === CONTENT_POLICY_CATEGORIES  (AI order)
 *
 * "surface" = entity type the policy applies to (not UI placement).
 * vote_manipulation is post-only per backend/services/moderation-reports/parse.mts:37.
 */
export const MODERATION_POLICY = [
  {
    key: 'spam' as const,
    label: 'Spam',
    isReportReason: true as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'low' as const,
    appealEligible: true as const,
    recommendedAction: 'remove' as const,
    description:
      'Unsolicited bulk content, repeated identical messages, or content designed solely to promote products or services.',
  },
  {
    key: 'harassment' as const,
    label: 'Harassment',
    isReportReason: true as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'high' as const,
    appealEligible: true as const,
    recommendedAction: 'remove' as const,
    description:
      'Targeted abuse, threats, bullying, or sustained negative behaviour directed at a specific person or group.',
  },
  {
    key: 'misinformation' as const,
    label: 'Misinformation',
    isReportReason: true as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'medium' as const,
    appealEligible: true as const,
    recommendedAction: 'warn' as const,
    description:
      'Demonstrably false factual claims spread without evidence, particularly on health, safety, or election topics.',
  },
  {
    key: 'illegal_content' as const,
    label: 'Illegal content',
    isReportReason: true as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'critical' as const,
    appealEligible: true as const,
    recommendedAction: 'escalate' as const,
    description: 'Content that violates applicable law, including CSAM, fraud, or incitement.',
  },
  {
    key: 'hate_speech' as const,
    label: 'Hate speech',
    isReportReason: false as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'high' as const,
    appealEligible: true as const,
    recommendedAction: 'remove' as const,
    description:
      'Content that promotes hatred or discrimination based on race, ethnicity, religion, gender, sexual orientation, disability, or national origin.',
  },
  {
    key: 'sexual_content' as const,
    label: 'Sexual content',
    isReportReason: false as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'high' as const,
    appealEligible: true as const,
    recommendedAction: 'remove' as const,
    description: 'Explicit sexual content posted outside a permitted context.',
  },
  {
    key: 'violence' as const,
    label: 'Violence',
    isReportReason: false as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'critical' as const,
    appealEligible: true as const,
    recommendedAction: 'escalate' as const,
    description:
      'Graphic depictions of violence or content that glorifies or incites real-world violence.',
  },
  {
    key: 'privacy_violation' as const,
    label: 'Privacy violation',
    isReportReason: false as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'high' as const,
    appealEligible: true as const,
    recommendedAction: 'remove' as const,
    description:
      'Non-consensual sharing of personal information, private images, or identifying details.',
  },
  {
    key: 'off_topic' as const,
    label: 'Off topic',
    isReportReason: false as const,
    isAiCategory: true as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'low' as const,
    appealEligible: true as const,
    recommendedAction: 'no_action' as const,
    description: 'Content that is irrelevant to the community or discussion context.',
  },
  {
    key: 'vote_manipulation' as const,
    label: 'Vote manipulation',
    isReportReason: true as const,
    isAiCategory: false as const,
    surfaces: ['post'] as const,
    severity: 'medium' as const,
    appealEligible: true as const,
    recommendedAction: 'escalate' as const,
    description: 'Coordinated, deceptive, or manipulative voting or engagement activity.',
    /** Verbatim guidance for AI prompts (replaces content-policy description for this reason). */
    guidance:
      'Post-only report reason. Evaluate whether voting or engagement appears coordinated, deceptive, or manipulative; escalate when evidence is unclear or needs staff investigation.',
  },
  {
    key: 'other' as const,
    label: 'Other',
    isReportReason: true as const,
    isAiCategory: false as const,
    surfaces: MODERATION_REPORT_ENTITY_TYPES,
    severity: 'low' as const,
    appealEligible: true as const,
    recommendedAction: 'no_action' as const,
    description: 'Unclassified violation — reviewer determines closest category.',
    /** Verbatim guidance for AI prompts (replaces content-policy description for this reason). */
    guidance:
      'Catch-all report reason. Use the reporter note, target content, platform policy, and community rules to identify the closest violation or recommend no action.',
  },
] as const satisfies readonly PolicyEntry[]

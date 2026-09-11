/**
 * Platform content policy constants and prompt helpers.
 *
 * Keep in sync with ToS §4 AND articles/how-moderation-works.md
 *
 * Data derives from the canonical policy registry in
 * @ts-shared/utils/moderation-policy — do not add entries here directly.
 */
import {
  MODERATION_POLICY,
  CONTENT_POLICY_CATEGORIES,
  CONTENT_POLICY,
  isReportReason,
  isAiCategory,
  type ContentPolicyCategory,
} from '@ts-shared/utils/moderation-policy'
import type { ModerationReportReason } from '@ts-shared/utils/moderation-reports'

type ReportReasonContentPolicyCoverage =
  | {
      kind: 'content_policy_categories'
      categories: readonly ContentPolicyCategory[]
    }
  | {
      kind: 'explicit_guidance'
      guidance: string
    }

export const REPORT_REASON_CONTENT_POLICY_COVERAGE: Readonly<
  Record<ModerationReportReason, ReportReasonContentPolicyCoverage>
> = Object.fromEntries(
  MODERATION_POLICY.reduce<[ModerationReportReason, ReportReasonContentPolicyCoverage][]>(
    (acc, e) => {
      if (!isReportReason(e)) return acc
      if (isAiCategory(e)) {
        acc.push([e.key, { kind: 'content_policy_categories', categories: [e.key] }])
      } else {
        // Report-only entries always carry guidance: the discriminated union guarantees
        // this branch is variant 3 ({ isReportReason: true, isAiCategory: false, guidance: string }).
        acc.push([e.key, { kind: 'explicit_guidance', guidance: e.guidance }])
      }
      return acc
    },
    [],
  ),
) as Readonly<Record<ModerationReportReason, ReportReasonContentPolicyCoverage>>

/**
 * Renders the content policy as a numbered list for inclusion in AI prompts.
 */
export function renderContentPolicyForPrompt(): string {
  const lines = CONTENT_POLICY_CATEGORIES.map((category, i) => {
    const description = CONTENT_POLICY[category]
    return `${i + 1}. **${category}**: ${description}`
  })
  return lines.join('\n')
}

export function renderReportReasonPolicyCoverageForPrompt(): string {
  const lines = Object.entries(REPORT_REASON_CONTENT_POLICY_COVERAGE).map(
    ([reason, coverage], i) => {
      if (coverage.kind === 'content_policy_categories') {
        return `${i + 1}. **${reason}**: evaluate against ${coverage.categories.join(', ')}.`
      }
      return `${i + 1}. **${reason}**: ${coverage.guidance}`
    },
  )
  return lines.join('\n')
}

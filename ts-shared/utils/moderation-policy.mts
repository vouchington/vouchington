/**
 * Canonical moderation policy registry.
 *
 * Single source of truth from which report reasons (List A) and AI
 * content-policy categories (List B) both derive. Keep in sync with
 * ToS §4 AND articles/how-moderation-works.md.
 *
 * Severity and appealEligible are PROPOSED values pending product sign-off.
 * recommendedAction is advisory — no runtime code auto-dispatches on it
 * (that wiring is Phase 4, #5673).
 *
 * The raw registry array lives in moderation-policy-data.mts to stay
 * within the 200-line file limit.
 */
export {
  MODERATION_REPORT_ENTITY_TYPES,
  type ModerationReportEntityType,
  MODERATION_POLICY_SEVERITIES,
  type ModerationPolicySeverity,
  MODERATION_JUDGEMENT_ACTIONS,
  type ModerationJudgementAction,
  MODERATION_APPEAL_ACTIONS,
  type ModerationAppealAction,
  MODERATION_POLICY,
} from './moderation-policy-data.mts'
import { MODERATION_POLICY } from './moderation-policy-data.mts'

// Narrow literal type from the as-const registry. Used for type-guard parameters
// and derived literal unions — must NOT be replaced with the structural PolicyEntry
// type (which has key: string) or string unions widen to string.
type PolicyLiteral = (typeof MODERATION_POLICY)[number]

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isReportReason(
  e: PolicyLiteral,
): e is Extract<PolicyLiteral, { isReportReason: true }> {
  return e.isReportReason
}

export function isAiCategory(
  e: PolicyLiteral,
): e is Extract<PolicyLiteral, { isAiCategory: true }> {
  return e.isAiCategory
}

export function hasGuidance(e: PolicyLiteral): e is PolicyLiteral & { guidance: string } {
  return 'guidance' in e
}

// ---------------------------------------------------------------------------
// Derived types (narrowed literal unions — not string)
// ---------------------------------------------------------------------------

export type ModerationReportReason = Extract<PolicyLiteral, { isReportReason: true }>['key']
export type ContentPolicyCategory = Extract<PolicyLiteral, { isAiCategory: true }>['key']

// ---------------------------------------------------------------------------
// Derived runtime arrays (keep existing import paths working)
// ---------------------------------------------------------------------------

export const MODERATION_REPORT_REASONS: ReadonlyArray<ModerationReportReason> =
  MODERATION_POLICY.reduce<ModerationReportReason[]>((acc, e) => {
    if (isReportReason(e)) acc.push(e.key)
    return acc
  }, [])

export const MODERATION_REPORT_REASON_OPTIONS: ReadonlyArray<{
  value: ModerationReportReason
  label: string
}> = MODERATION_POLICY.reduce<{ value: ModerationReportReason; label: string }[]>((acc, e) => {
  if (isReportReason(e)) acc.push({ value: e.key, label: e.label })
  return acc
}, [])

export const MODERATION_REPORT_REASON_SEVERITY_RANK = {
  other: 1,
  spam: 2,
  misinformation: 3,
  harassment: 4,
  vote_manipulation: 4,
  illegal_content: 5,
} as const satisfies Record<ModerationReportReason, number>

export const MODERATION_REPORT_REASON_SEVERITY_ORDER: ReadonlyArray<ModerationReportReason> =
  Object.entries(MODERATION_REPORT_REASON_SEVERITY_RANK)
    .sort((a, b) => {
      const rankDelta = b[1] - a[1]
      if (rankDelta !== 0) return rankDelta
      return (
        MODERATION_REPORT_REASONS.indexOf(a[0] as ModerationReportReason) -
        MODERATION_REPORT_REASONS.indexOf(b[0] as ModerationReportReason)
      )
    })
    .map(([reason]) => reason as ModerationReportReason)

export const CONTENT_POLICY_CATEGORIES: ReadonlyArray<ContentPolicyCategory> =
  MODERATION_POLICY.reduce<ContentPolicyCategory[]>((acc, e) => {
    if (isAiCategory(e)) acc.push(e.key)
    return acc
  }, [])

export const CONTENT_POLICY: Readonly<Record<ContentPolicyCategory, string>> =
  MODERATION_POLICY.reduce<Partial<Record<ContentPolicyCategory, string>>>((acc, e) => {
    if (isAiCategory(e)) acc[e.key] = e.description
    return acc
  }, {}) as Readonly<Record<ContentPolicyCategory, string>>

const POLICY_SEVERITY_BY_KEY: Readonly<
  Record<string, import('./moderation-policy-data.mts').ModerationPolicySeverity>
> = MODERATION_POLICY.reduce<
  Record<string, import('./moderation-policy-data.mts').ModerationPolicySeverity>
>((acc, e) => {
  acc[e.key] = e.severity
  return acc
}, {})

export function getPolicySeverity(
  reason: string,
): import('./moderation-policy-data.mts').ModerationPolicySeverity | null {
  return POLICY_SEVERITY_BY_KEY[reason] ?? null
}

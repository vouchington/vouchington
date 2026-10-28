import { ENV_REVIEW_REASONS } from './review-reasons-env.mts'
import { PG_ENV_REVIEW_REASONS } from './review-reasons-pg.mts'

export const GENERIC_REVIEW_REASON =
  'Reviewed by config inventory v1; no stable automated class inferred.'

export function reviewReasonForEnvVar(name: string): string | null {
  return ENV_REVIEW_REASONS.get(name) ?? PG_ENV_REVIEW_REASONS.get(name) ?? null
}

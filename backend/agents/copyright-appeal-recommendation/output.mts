export type CopyrightAppealRecommendationOutput = {
  recommendation: 'confirm' | 'modify' | 'reverse' | 'uncertain'
  rationale: string
}

/** Bounds the schema-valid model output; a rationale past the bound is rejected, never truncated. */
export function parseCopyrightAppealRecommendationOutput(
  value: unknown,
): CopyrightAppealRecommendationOutput {
  const output = value as { recommendation?: unknown; rationale?: unknown } | null
  const recommendation = output?.recommendation
  const rationale = output?.rationale
  if (
    (recommendation !== 'confirm' &&
      recommendation !== 'modify' &&
      recommendation !== 'reverse' &&
      recommendation !== 'uncertain') ||
    typeof rationale !== 'string' ||
    rationale.length > 10_000
  )
    throw new TypeError('Invalid copyright appeal recommendation output')
  return { recommendation, rationale }
}

type CloudflareBotManagementRequest = Request & {
  cf?: { botManagement?: { score?: unknown } }
}

/**
 * Bot Management scores are 1–99. Cloudflare uses zero when a score was not computed, and free
 * zones omit the Enterprise field entirely; both cases intentionally degrade to no signal.
 */
export function getCloudflareBotScore(request: Request): number | undefined {
  const score = (request as CloudflareBotManagementRequest).cf?.botManagement?.score
  return typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 99
    ? score
    : undefined
}

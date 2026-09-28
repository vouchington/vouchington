export function voteDetailFacts(details: Record<string, unknown>): {
  youngAccountVoteCount: number | null
  threshold: number | null
  windowMinutes: number | null
  youngAccountAgeDays: number | null
  ips: Array<{ ipAddress: string; distinctUserCount: number }>
} {
  const known = new Set([
    'young_account_vote_count',
    'threshold',
    'window_minutes',
    'young_account_age_days',
    'correlated_ips',
  ])
  for (const key of Object.keys(details)) {
    if (!known.has(key)) throw new Error(`Unknown vote integrity detail: ${key}`)
  }
  const ips = Array.isArray(details.correlated_ips) ? details.correlated_ips : []
  if (details.correlated_ips != null && !Array.isArray(details.correlated_ips)) {
    throw new Error('Invalid vote integrity correlated IPs')
  }
  return {
    youngAccountVoteCount: detailNumber(details, 'young_account_vote_count'),
    threshold: detailNumber(details, 'threshold'),
    windowMinutes: detailNumber(details, 'window_minutes'),
    youngAccountAgeDays: detailNumber(details, 'young_account_age_days'),
    ips: ips.map(item => {
      if (!item || typeof item !== 'object') throw new Error('Invalid vote integrity correlated IP')
      const ip = item as { ip_address?: unknown; distinct_user_count?: unknown }
      if (typeof ip.ip_address !== 'string' || typeof ip.distinct_user_count !== 'number') {
        throw new Error('Invalid vote integrity correlated IP')
      }
      return { ipAddress: ip.ip_address, distinctUserCount: ip.distinct_user_count }
    }),
  }
}

function detailNumber(details: Record<string, unknown>, key: string): number | null {
  if (!Object.hasOwn(details, key)) return null
  const value = details[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid vote integrity detail: ${key}`)
  }
  return value
}

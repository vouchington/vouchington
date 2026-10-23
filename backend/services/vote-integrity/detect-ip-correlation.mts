import { countDistinctVoteUsersForIp } from './ip-window.mts'
import { IP_CORRELATION_THRESHOLD, IP_CORRELATION_WINDOW_MINUTES } from './config.mts'

type IpCorrelationDetail = {
  ip_address: string
  distinct_user_count: number
}

type IpCorrelationResult = {
  flagged: boolean
  details: {
    correlated_ips: IpCorrelationDetail[]
    threshold: number
    window_minutes: number
  }
}

export async function detectIpCorrelation(
  entityType: string,
  entityId: string,
  ipAddress: string | null,
  asOf: Date,
): Promise<IpCorrelationResult> {
  const asOfMs = asOf.getTime()
  if (!Number.isFinite(asOfMs)) throw new RangeError('asOf must be a finite date')
  const count = ipAddress
    ? await countDistinctVoteUsersForIp(entityType, entityId, ipAddress, asOf)
    : 0
  const flagged = count >= IP_CORRELATION_THRESHOLD

  return {
    flagged,
    details: {
      correlated_ips: flagged ? [{ ip_address: ipAddress!, distinct_user_count: count }] : [],
      threshold: IP_CORRELATION_THRESHOLD,
      window_minutes: IP_CORRELATION_WINDOW_MINUTES,
    },
  }
}

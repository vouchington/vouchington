import { resolveTxt } from 'node:dns/promises'
import {
  DnsTimeoutError as UpstreamDnsTimeoutError,
  resolveTxtRecords as resolveUpstreamTxtRecords,
} from '@vouchington/domain-verification'

const DNS_TIMEOUT_MS = 5000
const DNS_MAX_RETRIES = 2

export class DnsTimeoutError extends Error {
  constructor(options?: ErrorOptions) {
    super('DNS TXT lookup timeout', options)
    this.name = 'DnsTimeoutError'
  }
}

/* no-mistakes: integration=http */
export async function resolveTxtRecords(hostname: string): Promise<string[]> {
  try {
    return await resolveUpstreamTxtRecords(hostname, {
      lookup: resolveTxt,
      retries: DNS_MAX_RETRIES,
      timeoutMs: DNS_TIMEOUT_MS,
    })
  } catch (error) {
    if (
      error instanceof UpstreamDnsTimeoutError ||
      (error instanceof Error && error.name === 'DnsTimeoutError')
    ) {
      throw new DnsTimeoutError({ cause: error })
    }
    throw error
  }
}

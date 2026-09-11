import { resolveMx } from 'node:dns/promises'

const DNS_TIMEOUT_MS = 5000 // 5 seconds
const DNS_MAX_RETRIES = 2 // retry up to 2 times (3 attempts total)

export class DnsTimeoutError extends Error {
  constructor() {
    super('DNS lookup timeout')
    this.name = 'DnsTimeoutError'
  }
}

function resolveMxWithTimeout(domain: string): Promise<{ exchange: string; priority: number }[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DnsTimeoutError()), DNS_TIMEOUT_MS)
    resolveMx(domain)
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(error => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

/* no-mistakes: integration=http */
export async function resolveMxRecords(
  domain: string,
): Promise<{ exchange: string; priority: number }[]> {
  let lastError: Error = new Error('DNS lookup failed')
  for (let attempt = 0; attempt <= DNS_MAX_RETRIES; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- a DNS timeout must settle before the retry budget advances
      return await resolveMxWithTimeout(domain)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // Only retry on timeout; other DNS errors (NXDOMAIN, NODATA) are definitive
      if (!(lastError instanceof DnsTimeoutError)) throw lastError
    }
  }
  throw lastError
}

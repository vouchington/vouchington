import dnsPromises from 'node:dns/promises'
import type { MxRecord } from 'node:dns'
import { afterAll, beforeAll, vi, type MockInstance } from 'vitest'

const TEST_MX_RECORDS: MxRecord[] = [{ exchange: 'example.com', priority: 10 }]

function resolveTestEmailMxRecords(domain: string): Promise<MxRecord[]> {
  const normalized = domain.toLowerCase().trim().replace(/\.$/, '')
  if (normalized.endsWith('.invalid') || normalized.endsWith('.test')) return Promise.resolve([])
  return Promise.resolve(TEST_MX_RECORDS)
}

export function installEmailDomainDnsMock(): void {
  let dnsMock: MockInstance<typeof dnsPromises.resolveMx> | undefined
  beforeAll(() => {
    dnsMock = vi.spyOn(dnsPromises, 'resolveMx').mockImplementation(resolveTestEmailMxRecords)
  })
  afterAll(() => {
    dnsMock?.mockRestore()
    dnsMock = undefined
  })
}

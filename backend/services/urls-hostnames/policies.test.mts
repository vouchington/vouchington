import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'
import { getBlocklistedDomainKeys, getHostnamePolicyGroups } from './policies.mts'

describe('hostname policy candidates', () => {
  it('returns one key when several URL blocklist sources and suffixes match', async () => {
    const suffix = randomUUID()
      .replaceAll('-', '')
      .split('')
      .map(digit => String.fromCharCode(97 + Number.parseInt(digit, 16)))
      .join('')
    const domain = `blocked-${suffix}.test`
    const names = [`policy-a-${suffix}`, `policy-b-${suffix}`, `policy-c-${suffix}`]
    const sourceIds: Array<Awaited<ReturnType<typeof createTestBlacklistSource>>> = []
    try {
      for (const name of names)
        sourceIds.push(
          await createTestBlacklistSource({ type: 'url', name, url: 'https://example.com' }),
        )
      await insertTestDomainBlacklist(domain, names[0])
      await insertTestDomainBlacklist(domain, names[1])
      await insertTestDomainBlacklist(`sub.${domain}`, names[2])
      const hostname = `sub.${domain}`
      const unrelated = `other-${suffix}.test`
      expect(
        await getBlocklistedDomainKeys(getHostnamePolicyGroups([hostname, unrelated])),
      ).toEqual(new Set([hostname]))
    } finally {
      for (const sourceId of sourceIds) await deleteTestBlacklistSource(sourceId)
    }
  })
})

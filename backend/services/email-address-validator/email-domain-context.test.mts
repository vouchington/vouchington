import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readTestEmailDomainHostname } from '@voucha/test-helpers/entities/email-domain-hostname'
import {
  resolveEmailDomainHostnameId,
  resolveEmailDomainHostnameIds,
} from './email-domain-context.mts'

describe('email domain hostname identity', () => {
  it('resolves the final address domain after a quoted local @ and normalizes case', async () => {
    const domain = `quoted-domain-${randomUUID()}.test`
    const quotedId = await resolveEmailDomainHostnameId(`"left@right"@${domain.toUpperCase()}`)
    const plainId = await resolveEmailDomainHostnameId(`user@${domain}`)
    expect(quotedId).toBe(plainId)
    if (!quotedId) throw new Error('Quoted email domain was not resolved')
    expect(await readTestEmailDomainHostname(quotedId)).toBe(domain)
  })

  it('resolves a batch of repeated and distinct domains to their own hostname IDs', async () => {
    const firstDomain = `batch-first-${randomUUID()}.test`
    const secondDomain = `batch-second-${randomUUID()}.test`
    const [firstId, repeatedId, secondId, missingId] = await resolveEmailDomainHostnameIds([
      `first@${firstDomain}`,
      `"left@right"@${firstDomain.toUpperCase()}`,
      `second@${secondDomain}`,
      null,
    ])
    expect(firstId).toBeTruthy()
    expect(repeatedId).toBe(firstId)
    expect(secondId).toBeTruthy()
    expect(secondId).not.toBe(firstId)
    expect(missingId).toBeNull()
    expect(await readTestEmailDomainHostname(firstId!)).toBe(firstDomain)
    expect(await readTestEmailDomainHostname(secondId!)).toBe(secondDomain)
  })
})

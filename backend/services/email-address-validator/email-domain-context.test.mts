import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readTestEmailDomainHostname } from '@voucha/test-helpers/entities/email-domain-hostname'
import { resolveEmailDomainHostnameId } from './email-domain-context.mts'

describe('email domain hostname identity', () => {
  it('resolves the final address domain after a quoted local @ and normalizes case', async () => {
    const domain = `quoted-domain-${randomUUID()}.test`
    const quotedId = await resolveEmailDomainHostnameId(`"left@right"@${domain.toUpperCase()}`)
    const plainId = await resolveEmailDomainHostnameId(`user@${domain}`)
    expect(quotedId).toBe(plainId)
    if (!quotedId) throw new Error('Quoted email domain was not resolved')
    expect(await readTestEmailDomainHostname(quotedId)).toBe(domain)
  })
})

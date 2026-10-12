import { randomUUID } from 'node:crypto'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { resolveEmailDomainHostnameId } from './email-domain-context.mts'

describe('email domain hostname identity', () => {
  it('resolves the final address domain after a quoted local @ and normalizes case', async () => {
    const domain = `quoted-domain-${randomUUID()}.test`
    const quotedId = await resolveEmailDomainHostnameId(`"left@right"@${domain.toUpperCase()}`)
    const plainId = await resolveEmailDomainHostnameId(`user@${domain}`)
    expect(quotedId).toBe(plainId)
    const { rows } = await read<{ hostname: string }>(sql`/* verifyEmailDomainHostnameId */
    SELECT hostname FROM url_hostnames WHERE id = ${quotedId}`)
    expect(rows[0]?.hostname).toBe(domain)
  })
})

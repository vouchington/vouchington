import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userProductLimitsConfig } from '@services/user-product-limits'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
} from './email-address-verification.mts'
import { listEmailAddressesPage, removeEmailAddress } from './email-addresses.mts'

describe('verified email capacity', () => {
  installEmailDomainDnsMock()

  it('keeps the verification token usable after a full account removes an address', async () => {
    const user = await createTestUser()
    const additional = Array.from(
      { length: 9 },
      (_, index) => `tests+cap-${user.id}-${index}@voucha.ai`,
    )
    for (const email of additional) await addVerifiedEmailForUser(user.id, email)
    const requested = `tests+cap-${user.id}-new@voucha.ai`
    const { token } = await createEmailVerificationToken(user.id, requested)
    await expect(verifyEmailVerificationToken(user.id, requested, token)).rejects.toMatchObject({
      status: 400,
      code: 'EMAIL_ADDRESS_LIMIT_REACHED',
    })
    const full = await listEmailAddressesPage(user.id, { limit: 20 })
    expect(full.results).toHaveLength(10)
    expect(full.results.some(row => row.email_address === requested)).toBe(false)
    await removeEmailAddress(user.id, additional[0]!)
    await verifyEmailVerificationToken(user.id, requested, token)
    const after = await listEmailAddressesPage(user.id, { limit: 20 })
    expect(after.results).toHaveLength(10)
    expect(after.results.some(row => row.email_address === requested)).toBe(true)
  })

  it('admits only one of two concurrent verifications for the last address', async () => {
    const user = await createTestUser()
    for (let index = 0; index < 8; index++) {
      await addVerifiedEmailForUser(user.id, `tests+race-${user.id}-${index}@voucha.ai`)
    }
    const first = `tests+race-${user.id}-first@voucha.ai`
    const second = `tests+race-${user.id}-second@voucha.ai`
    const firstToken = await createEmailVerificationToken(user.id, first)
    const secondToken = await createEmailVerificationToken(user.id, second)
    const outcomes = await Promise.allSettled([
      verifyEmailVerificationToken(user.id, first, firstToken.token),
      verifyEmailVerificationToken(user.id, second, secondToken.token),
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(outcome => outcome.status === 'rejected')
    expect([400, 409]).toContain(rejected?.reason.status)
    const after = await listEmailAddressesPage(user.id, { limit: 20 })
    expect(after.results).toHaveLength(10)
    expect(after.results.filter(row => [first, second].includes(row.email_address))).toHaveLength(1)
  })

  it('rejects an address above the configured cap and keeps every stored address listed', async () => {
    const user = await createTestUser()
    for (let index = 0; index < 2; index++) {
      await addVerifiedEmailForUser(user.id, `tests+low-${user.id}-${index}@voucha.ai`)
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userProductLimitsConfig, { email_addresses_max: 3 }),
    )
    const requested = `tests+low-${user.id}-new@voucha.ai`
    const { token } = await createEmailVerificationToken(user.id, requested)
    await expect(verifyEmailVerificationToken(user.id, requested, token)).rejects.toMatchObject({
      status: 400,
      code: 'EMAIL_ADDRESS_LIMIT_REACHED',
    })
    expect((await listEmailAddressesPage(user.id, { limit: 20 })).results).toHaveLength(3)
  })
})

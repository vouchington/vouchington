import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  createTestUserDirect,
  retireTestMembershipProviderProduct,
} from '@voucha/test-helpers'
import { createTestRenewalEmail } from '@voucha/test-helpers/renewal-email'
import { processSendRenewalPriceIncreaseEmail } from './send-renewal-price-increase-email.mts'

describe('processSendRenewalPriceIncreaseEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('sends the renewal price increase email without unsubscribe headers', async () => {
    const user = await createTestUser()
    const { data: preparedData, renewalProductId } = await createTestRenewalEmail(user!.id)
    const data = {
      ...preparedData,
      currentPriceCents: 1,
      currency: 'EUR',
      plan: 'plus',
      interval: 'month',
      expiresAt: '2000-01-01T00:00:00.000Z',
    }

    await processSendRenewalPriceIncreaseEmail(data)
    await processSendRenewalPriceIncreaseEmail(data)

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: 'Your Voucha Pro renewal price is changing',
        text: expect.stringMatching(/\$9\.00[\s\S]*\$12\.00/),
      }),
    )
    expect(ses.sendEmail).toHaveBeenCalledTimes(1)
    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.not.objectContaining({
        headers: expect.anything(),
      }),
    )
    await retireTestMembershipProviderProduct(renewalProductId)
  })

  it('does not retry after delivery is attempted', async () => {
    const user = await createTestUser()
    const { data, renewalProductId } = await createTestRenewalEmail(user!.id)
    vi.mocked(ses.sendEmail).mockRejectedValueOnce(new Error('SES unavailable'))

    await expect(processSendRenewalPriceIncreaseEmail(data)).rejects.toThrow('SES unavailable')
    await expect(processSendRenewalPriceIncreaseEmail(data)).resolves.toBeNull()

    expect(ses.sendEmail).toHaveBeenCalledTimes(1)
    await retireTestMembershipProviderProduct(renewalProductId)
  })

  it('releases the durable claim when the user has no email address', async () => {
    const user = await createTestUserDirect()
    const { data, renewalProductId } = await createTestRenewalEmail(user!.id)

    await expect(processSendRenewalPriceIncreaseEmail(data)).resolves.toBeNull()
    await expect(processSendRenewalPriceIncreaseEmail(data)).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
    await retireTestMembershipProviderProduct(renewalProductId)
  })
})

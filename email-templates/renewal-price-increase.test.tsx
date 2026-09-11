import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderRenewalPriceIncreaseEmail } from './renewal-price-increase-renderer.mts'
import RenewalPriceIncreaseEmail from './renewal-price-increase.tsx'

describe('renderRenewalPriceIncreaseEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderRenewalPriceIncreaseEmail(RenewalPriceIncreaseEmail.PreviewProps!)

    expect(result.subject).toBe('Your Voucha Plus renewal price is changing')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/renewal-price-increase.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/renewal-price-increase.txt', import.meta.url)),
    )
  })

  it('includes the current price, new price, renewal date, and membership URL', async () => {
    const result = await renderRenewalPriceIncreaseEmail({
      plan: 'plus',
      interval: 'month',
      currentPrice: { amount: 900, currency: 'usd' },
      newPrice: { amount: 1200, currency: 'usd' },
      renewsAt: '2026-08-01T00:00:00.000Z',
      membershipUrl: 'https://voucha.ai/my/membership',
    })

    expect(result.text).toContain('$9.00')
    expect(result.text).toContain('$12.00')
    expect(result.text).toContain('August 1, 2026')
    expect(result.text).toContain('https://voucha.ai/my/membership')
  })

  it('renders localized Spanish copy and formatting', async () => {
    const result = await renderRenewalPriceIncreaseEmail({
      ...RenewalPriceIncreaseEmail.PreviewProps!,
      uiLocale: 'es',
    })

    expect(result.subject).toBe('El precio de renovación de Voucha Plus va a cambiar')
    expect(result.text).toContain('1 de agosto de 2026')
    expect(result.text).toContain('Revisar membresía')
    expect(result.text).toContain('El equipo de Voucha')
  })

  it.each([
    ['fr', 'Le prix de renouvellement de Voucha Plus va changer', "Consulter l'abonnement"],
    ['pt', 'O preço de renovação do Voucha Plus vai mudar', 'Revisar assinatura'],
  ])('renders localized %s copy', async (uiLocale, subject, button) => {
    const result = await renderRenewalPriceIncreaseEmail({
      ...RenewalPriceIncreaseEmail.PreviewProps!,
      uiLocale,
    })

    expect(result.subject).toBe(subject)
    expect(result.text).toContain(button)
  })

  it('formats prices using the currency minor unit', async () => {
    const result = await renderRenewalPriceIncreaseEmail({
      ...RenewalPriceIncreaseEmail.PreviewProps!,
      currentPrice: { amount: 1000, currency: 'jpy' },
      newPrice: { amount: 2000, currency: 'jpy' },
    })

    expect(result.text).toContain('¥1,000')
    expect(result.text).toContain('¥2,000')
  })

  it('formats the largest safe amount without floating-point precision loss', async () => {
    const result = await renderRenewalPriceIncreaseEmail({
      ...RenewalPriceIncreaseEmail.PreviewProps!,
      currentPrice: { amount: 9_007_199_254_740_991, currency: 'usd' },
      newPrice: { amount: 9_007_199_254_740_991, currency: 'usd' },
    })
    expect(result.text).toContain('$90,071,992,547,409.91')
  })

  it('renders database yearly intervals as annual prices', async () => {
    const result = await renderRenewalPriceIncreaseEmail({
      ...RenewalPriceIncreaseEmail.PreviewProps!,
      interval: 'yearly',
    })

    expect(result.text).toContain('per year')
    expect(result.text).not.toContain('per month')
  })
})

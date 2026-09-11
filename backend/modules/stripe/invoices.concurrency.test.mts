import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { getCompleteStripeInvoiceLines, listAllStripeSubscriptionInvoices } from './invoices.mts'

describe('stripe invoice hydration concurrency', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hydrates paid invoices with bounded concurrency', async () => {
    const invoiceIds = ['in_first', 'in_second', 'in_third', 'in_fourth']
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: invoiceIds.map(id => ({
        id,
        payments: { data: [], has_more: false },
        status: 'paid',
      })),
      has_more: false,
    })
    const linePageResolvers = new Map<string, (value: { data: []; has_more: false }) => void>()
    const listLineItems = vi.fn<VitestLooseMock>().mockImplementation(
      (invoiceId: string) =>
        new Promise(resolve => {
          linePageResolvers.set(invoiceId, resolve)
        }),
    )
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { list, listLineItems },
    } as never)

    const hydratedInvoices = listAllStripeSubscriptionInvoices('sub_123')

    await vi.waitFor(() => expect(listLineItems).toHaveBeenCalledTimes(3))
    expect(listLineItems.mock.calls.map(([invoiceId]) => invoiceId)).toEqual(invoiceIds.slice(0, 3))

    for (const invoiceId of invoiceIds.slice(0, 3))
      linePageResolvers.get(invoiceId)?.({ data: [], has_more: false })

    await vi.waitFor(() => expect(listLineItems).toHaveBeenCalledTimes(4))
    linePageResolvers.get('in_fourth')?.({ data: [], has_more: false })

    await expect(hydratedInvoices).resolves.toMatchObject(invoiceIds.map(id => ({ id })))
  })

  it('rejects an empty continued invoice-line page', async () => {
    const listLineItems = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: true })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { listLineItems },
    } as never)

    await expect(getCompleteStripeInvoiceLines({ id: 'in_empty_lines' } as never)).rejects.toThrow(
      'Stripe returned an empty invoice line page for invoice in_empty_lines',
    )
  })

  it('bounds invoice-line pagination', async () => {
    const listLineItems = vi.fn<VitestLooseMock>().mockImplementation(async () => ({
      data: [{ id: `il_${listLineItems.mock.calls.length}` }],
      has_more: true,
    }))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { listLineItems },
    } as never)

    await expect(
      getCompleteStripeInvoiceLines({ id: 'in_unbounded_lines' } as never),
    ).rejects.toThrow('Stripe invoice in_unbounded_lines exceeded the line page limit')
    expect(listLineItems).toHaveBeenCalledTimes(10)
  })
})

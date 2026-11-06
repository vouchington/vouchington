import { vi } from 'vitest'
import * as stripeClient from '../modules/stripe/client.mts'

export function stubEmptyStripeInvoiceList(): () => void {
  const client = vi.spyOn(stripeClient, 'getStripeClient').mockReturnValue({
    invoices: { list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }) },
  } as unknown as ReturnType<typeof stripeClient.getStripeClient>)
  return () => client.mockRestore()
}

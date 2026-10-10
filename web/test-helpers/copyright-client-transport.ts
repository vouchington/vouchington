import { expect, vi } from 'vitest'
export const fetchTransport = vi.fn<typeof fetch>()

export function jsonResponse(body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: body === undefined ? 204 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
export async function expectTransportWrapperCall({
  mock,
  response,
  call,
  expectedArgs,
}: {
  mock: { mockClear(): unknown }
  response: unknown
  call: () => Promise<unknown>
  expectedArgs: readonly unknown[]
}) {
  mock.mockClear()
  fetchTransport.mockResolvedValueOnce(jsonResponse(response))
  expect(await call()).toEqual(response)
  expect(mock).toHaveBeenCalledOnce()
  expect(mock).toHaveBeenCalledWith(...expectedArgs)
}

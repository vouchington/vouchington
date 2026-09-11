import { expect } from 'vitest'

interface ApiMock<TResponse> {
  mockResolvedValueOnce(response: TResponse): unknown
}

export async function expectApiWrapperCall<TResponse>({
  mock,
  response,
  call,
  expectedArgs,
}: {
  mock: ApiMock<TResponse>
  response: TResponse
  call: () => Promise<TResponse>
  expectedArgs: readonly unknown[]
}): Promise<void> {
  mock.mockResolvedValueOnce(response)

  const result = await call()

  expect(result).toBe(response)
  expect(mock).toHaveBeenCalledOnce()
  expect(mock).toHaveBeenCalledWith(...expectedArgs)
}

type MockWithCalls = {
  mock: { calls: unknown[][] }
}

export function getBeforeSend<T>(init: MockWithCalls): T {
  const options = init.mock.calls.at(-1)?.[0] as { beforeSend?: T } | undefined
  const beforeSend = options?.beforeSend
  if (!beforeSend) throw new Error('Expected Sentry.init to receive beforeSend')
  return beforeSend
}

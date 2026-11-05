type MockWithCalls = {
  mock: { calls: unknown[][] }
}

export function getBeforeSend(init: MockWithCalls): unknown {
  const options = init.mock.calls.at(-1)?.[0] as { beforeSend?: unknown } | undefined
  const beforeSend = options?.beforeSend
  if (!beforeSend) throw new Error('Expected Sentry.init to receive beforeSend')
  return beforeSend
}

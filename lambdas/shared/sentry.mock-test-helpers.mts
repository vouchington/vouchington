import type { InitSentryOptions } from './sentry.mts'

type BeforeSend = NonNullable<InitSentryOptions['beforeSend']>
type MockWithCalls = {
  mock: { calls: unknown[][] }
}

export function getBeforeSend(init: MockWithCalls): BeforeSend {
  const options = init.mock.calls.at(-1)?.[0] as { beforeSend?: BeforeSend } | undefined
  const beforeSend = options?.beforeSend
  if (!beforeSend) throw new Error('Expected Sentry.init to receive beforeSend')
  return beforeSend
}

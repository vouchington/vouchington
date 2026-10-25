import type * as Sentry from '@sentry/aws-serverless'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
export type BeforeSend = NonNullable<SentryInitOptions['beforeSend']>
type MockWithCalls = {
  mock: { calls: unknown[][] }
}

export function getBeforeSend(init: MockWithCalls): BeforeSend {
  const options = init.mock.calls.at(-1)?.[0] as { beforeSend?: BeforeSend } | undefined
  const beforeSend = options?.beforeSend
  if (!beforeSend) throw new Error('Expected Sentry.init to receive beforeSend')
  return beforeSend
}

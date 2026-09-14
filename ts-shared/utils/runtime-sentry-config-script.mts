import { getSentryDsnConfig } from './sentry-deployment-gate.mts'

export const RUNTIME_PUBLIC_CONFIG_READY_EVENT = 'voucha:runtime-public-config-ready'

export function buildRuntimeSentryConfigScript(
  environment: string | undefined,
  sentryWebDsn: string | undefined,
): string {
  const config = {
    environment,
    sentryDsn: getSentryDsnConfig(sentryWebDsn)?.dsn,
  }
  const serializedConfig = JSON.stringify(config)
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  return `window.__VOUCHA_PUBLIC_CONFIG__=Object.assign({},window.__VOUCHA_PUBLIC_CONFIG__,${serializedConfig});window.dispatchEvent(new Event(${JSON.stringify(RUNTIME_PUBLIC_CONFIG_READY_EVENT)}))`
}

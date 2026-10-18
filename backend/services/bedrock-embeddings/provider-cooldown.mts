import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'

const KEY_PREFIX = 'background-cpu:provider-cooldown'
const setProviderCooldownScript = registerScript(
  loadScript('set-provider-cooldown.lua', import.meta.url),
)

function cooldownKey(groupKey: string): string {
  return `${KEY_PREFIX}:{${groupKey}}`
}

/** A provider cooldown is shared by every worker serving this ordering lane. */
export async function getCpuProviderCooldownRemainingMs(groupKey: string): Promise<number | null> {
  const remainingMs = await rateLimiterValkeyClient.pttl(cooldownKey(groupKey))
  return remainingMs > 0 ? remainingMs : null
}

/** A concurrent shorter Retry-After cannot shorten an existing provider cooldown. */
export async function extendCpuProviderCooldownMs(
  groupKey: string,
  durationMs: number,
): Promise<number> {
  const result = await rateLimiterValkeyClient.invokeScript(setProviderCooldownScript, {
    keys: [cooldownKey(groupKey)],
    args: [String(durationMs)],
  })
  if (typeof result !== 'number' && typeof result !== 'bigint') {
    throw new Error('Provider cooldown script returned an invalid duration')
  }
  const remainingMs = Number(result)
  if (!Number.isSafeInteger(remainingMs) || remainingMs <= 0) {
    throw new Error('Provider cooldown script returned an invalid duration')
  }
  return remainingMs
}

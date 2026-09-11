import { randomUUID } from 'node:crypto'
import type { GlideString } from '@valkey/valkey-glide'
import { bloomValkeyClient } from '@data-stores/valkey'

const UNLINK_READY_MARKER_IF_VALUE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end

return redis.call('DEL', KEYS[1])
`

export function newBloomReadyMarkerValue(): string {
  return `ready:${randomUUID()}`
}

export async function unlinkReadyMarkerIfValue(
  key: string,
  expectedValue: GlideString,
): Promise<number> {
  const result = await bloomValkeyClient.customCommand([
    'EVAL',
    UNLINK_READY_MARKER_IF_VALUE_SCRIPT,
    '1',
    key,
    expectedValue,
  ])
  return Number(result)
}

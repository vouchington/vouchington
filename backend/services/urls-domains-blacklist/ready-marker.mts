import { randomUUID } from 'node:crypto'
import type { GlideString } from '@valkey/valkey-glide'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { unlinkIfValueMatches } from '@data-stores/valkey/conditional'

export function newBloomReadyMarkerValue(): string {
  return `ready:${randomUUID()}`
}

/**
 * Removes a ready marker only when it still holds the value observed by the caller.
 * A concurrent refresh writes a new marker, and this compare-and-unlink leaves that marker in place.
 */
export async function unlinkReadyMarkerIfValue(
  key: string,
  expectedValue: GlideString,
): Promise<number> {
  const removed = await unlinkIfValueMatches(key, readyMarkerArgument(expectedValue), {
    client: bloomValkeyClient,
  })
  return removed ? 1 : 0
}

function readyMarkerArgument(value: GlideString): string {
  return typeof value === 'string' ? value : value.toString()
}

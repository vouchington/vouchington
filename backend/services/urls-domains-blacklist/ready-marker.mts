import { randomUUID } from 'node:crypto'
import type { GlideString } from '@valkey/valkey-glide'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import { unlinkIfValueMatches } from '@data-stores/valkey/conditional'
import { BLACKLISTS, getDomainBlacklistSourceTypeVersion } from './sources-constants.mts'
import type { DomainBlacklistType } from '@voucha/types/entities/domain-blacklist-source'

export function newBloomReadyMarkerValue(): string {
  return `ready:${randomUUID()}`
}

/** A source-type change must make previously completed filters unreadable before any rebuild. */
export function blocklistBloomReadyKey(
  filter: 'url-blocklist' | 'email-blocklist',
  sources: ReadonlyArray<{ name: string; type: DomainBlacklistType }> = BLACKLISTS,
): string {
  const version = getDomainBlacklistSourceTypeVersion(sources)
  return `bloom-filter:${filter}:ready:${version}`
}

/** A concurrent refresh writes a new marker, which this compare-and-unlink preserves. */
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

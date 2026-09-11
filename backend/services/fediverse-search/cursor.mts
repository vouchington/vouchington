import type { FediverseSearchProvider } from './types.mts'

export const FEDIVERSE_CURSOR_MAX_LENGTH = 512

type FediverseCursorPayload = {
  provider: FediverseSearchProvider
  value: string
}

/** Provider-tagged so a cursor minted for one provider is rejected when replayed against another. */
export function encodeFediverseCursor(provider: FediverseSearchProvider, value: string): string {
  const payload: FediverseCursorPayload = { provider, value }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/** Returns undefined for missing, oversized, malformed, or cross-provider cursors. */
export function decodeFediverseCursor(
  cursor: string | undefined,
  provider: FediverseSearchProvider,
): string | undefined {
  if (!cursor || cursor.length > FEDIVERSE_CURSOR_MAX_LENGTH) return undefined

  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<
      Record<keyof FediverseCursorPayload, unknown>
    >
    if (payload.provider !== provider) return undefined
    if (typeof payload.value !== 'string' || !payload.value) return undefined
    return payload.value
  } catch {
    return undefined
  }
}

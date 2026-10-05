import { sessionValkeyClient } from '../data-stores/valkey/clients.mts'
import { getJwtStaleKey } from '../data-stores/valkey/jwt-stale.mts'

export async function readTestJwtStaleMarker(userId: string): Promise<string | null> {
  const marker = await sessionValkeyClient.get(getJwtStaleKey(userId))
  return marker === null ? null : marker.toString()
}

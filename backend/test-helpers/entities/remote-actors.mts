import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Backdates a cached remote_actors row past REMOTE_ACTOR_CACHE_TTL_MS so a lookup treats it as
// stale — used to exercise the refetch-on-stale and fallback-on-refetch-failure paths.
export async function setTestRemoteActorFetchedAt(
  actorUri: string,
  fetchedAt: Date,
): Promise<void> {
  await write(sql`/* setTestRemoteActorFetchedAt */
    UPDATE remote_actors actor SET fetched_at = ${fetchedAt}
    FROM remote_actor_identities identity
    WHERE actor.id = identity.id AND identity.actor_uri = ${actorUri}
  `)
}

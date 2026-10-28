import { sessionValkeyClient } from '@data-stores/valkey/clients'

/** Evict only the issued challenge to exercise the public proof rejection path. */
export async function evictTestDbscChallenge(nonce: string): Promise<void> {
  await sessionValkeyClient.unlink([`voucha:dbsc-challenge:${nonce}`])
}

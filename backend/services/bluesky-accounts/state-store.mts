import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'
import type { NodeSavedState, NodeSavedStateStore } from '@modules/bluesky-oauth'
import { BLUESKY_OAUTH_STATE_TTL_SECONDS } from './lifecycle-constants.mts'

const KEY_PREFIX = 'bluesky-oauth-state'

// Valkey-backed NodeSavedStateStore: holds the short-lived PKCE verifier + DPoP key generated at
// the start of the OAuth authorize step (see @modules/bluesky-oauth/authorize.mts), consumed once
// the user is redirected back to our callback route (client.callback() reads then deletes the
// entry itself — see @modules/bluesky-oauth/callback.mts).
//
// Not encrypted at rest: this matches the codebase's existing convention for ephemeral
// Valkey-only OAuth/challenge state (services/passkeys/challenges.mts, services/mfa/login-attempt.mts)
// — Valkey here is a trusted, TTL-bounded internal store holding only a short-lived flow, not a
// durable credential. Contrast with session-store.mts, whose bluesky_linked_accounts rows persist
// indefinitely and are encrypted via @modules/token-secrets.
export class BlueskyStateStore implements NodeSavedStateStore {
  async get(key: string): Promise<NodeSavedState | undefined> {
    const result = await sessionValkeyClient.get(`${KEY_PREFIX}:${key}`)
    if (!result) return undefined
    return JSON.parse(result as string) as NodeSavedState
  }

  async set(key: string, value: NodeSavedState): Promise<void> {
    await sessionValkeyClient.set(`${KEY_PREFIX}:${key}`, JSON.stringify(value), {
      expiry: { type: TimeUnit.Seconds, count: BLUESKY_OAUTH_STATE_TTL_SECONDS },
    })
  }

  async del(key: string): Promise<void> {
    await sessionValkeyClient.del([`${KEY_PREFIX}:${key}`])
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActorFollowersUri,
  getActorFollowingUri,
  getActorInboxUri,
  getActorKeyId,
  getActorOutboxUri,
  getActorUri,
  getSharedInboxUri,
  parseLocalActorUriUserId,
} from './actor-uris.mts'

const USER_ID = '0190000a-0000-7000-8000-000000000001'

describe('actor URI builders', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a userId-based actor URI, never a username-based one', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(getActorUri(USER_ID)).toBe(`https://app.example.test/ap/users/${USER_ID}`)
  })

  it('derives keyId, inbox, outbox, followers, and following from the actor URI', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    const actorUri = getActorUri(USER_ID)
    expect(getActorKeyId(USER_ID)).toBe(`${actorUri}#main-key`)
    expect(getActorInboxUri(USER_ID)).toBe(`${actorUri}/inbox`)
    expect(getActorOutboxUri(USER_ID)).toBe(`${actorUri}/outbox`)
    expect(getActorFollowersUri(USER_ID)).toBe(`${actorUri}/followers`)
    expect(getActorFollowingUri(USER_ID)).toBe(`${actorUri}/following`)
  })

  it('builds a single shared inbox URI not scoped to any user', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(getSharedInboxUri()).toBe('https://app.example.test/ap/inbox')
  })

  it('recovers the userId from one of our own actor URIs', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(parseLocalActorUriUserId(getActorUri(USER_ID))).toBe(USER_ID)
  })

  it('returns undefined for URIs that are not local actor URIs', () => {
    expect(parseLocalActorUriUserId('https://remote.example/users/alice')).toBeUndefined()
    expect(parseLocalActorUriUserId('not a url')).toBeUndefined()
  })

  it('returns undefined for a remote host reusing our path shape (spoof guard)', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(parseLocalActorUriUserId(`https://attacker.example/ap/users/${USER_ID}`)).toBeUndefined()
  })
})

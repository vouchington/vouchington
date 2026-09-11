import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPostUri, parseLocalPostUriId } from './post-uris.mts'

const POST_ID = '0190000a-0000-7000-8000-000000000002'

describe('post URI builders', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a postId-based URI', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(getPostUri(POST_ID)).toBe(`https://app.example.test/ap/posts/${POST_ID}`)
  })

  it('recovers the postId from one of our own post URIs', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(parseLocalPostUriId(getPostUri(POST_ID))).toBe(POST_ID)
  })

  it('returns undefined for URIs that are not local post URIs', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(parseLocalPostUriId('https://app.example.test/ap/users/alice')).toBeUndefined()
    expect(parseLocalPostUriId('not a url')).toBeUndefined()
  })

  it('returns undefined for a remote host reusing our path shape (spoof guard)', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')

    expect(parseLocalPostUriId(`https://attacker.example/ap/posts/${POST_ID}`)).toBeUndefined()
  })
})

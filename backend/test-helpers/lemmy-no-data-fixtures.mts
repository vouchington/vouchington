import { vi } from 'vitest'

// Shared by the Lemmy no-data adapter tests. Import this module before
// createLemmyAdapter so this mock is registered before the adapter loads undici.
const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const HOST = 'lemmy.example'

const POST_VIEW = {
  post: {
    name: 'Hello Lemmy',
    body: 'Post body',
    ap_id: 'https://lemmy.example/post/1',
    published: '2024-01-01T00:00:00.000Z',
    thumbnail_url: null,
  },
  creator: {
    name: 'alice',
    display_name: 'Alice',
    actor_id: 'https://lemmy.example/u/alice',
  },
}

const USER_VIEW = {
  person: {
    name: 'bob',
    display_name: 'Bob',
    bio: null,
    actor_id: 'https://lemmy.example/u/bob',
    avatar: null,
    published: '2024-01-02T00:00:00.000Z',
  },
}

const COMMUNITY_VIEW = {
  community: {
    name: 'technology',
    title: 'Technology',
    description: null,
    actor_id: 'https://lemmy.example/c/technology',
    icon: null,
    published: '2024-01-03T00:00:00.000Z',
  },
}

type LemmyCombinedCursorShape = {
  p: { page: number; done: boolean }
  u: { page: number; done: boolean }
  c: { page: number; done: boolean }
}

function requestedSearchParams(callIndex = 0): URLSearchParams {
  const requestUrl = fetchSpy.mock.calls[callIndex]?.[0]
  const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl))
  return url.searchParams
}

export { COMMUNITY_VIEW, fetchSpy, HOST, POST_VIEW, requestedSearchParams, USER_VIEW }
export type { LemmyCombinedCursorShape }

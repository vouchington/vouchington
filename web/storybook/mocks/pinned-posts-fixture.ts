import { ClientRequest } from '@/lib/api/client/request'

let pinnedPostsFixture = false
const clientRequestPut = ClientRequest.prototype.put

export function setPinnedPostsFixture(): void {
  pinnedPostsFixture = true
}

export function clearPinnedPostsFixture(): void {
  pinnedPostsFixture = false
}

export function pinnedPostsFixtureEnabled(): boolean {
  return pinnedPostsFixture
}

export function pinnedPostsResponse(): { pinned_posts: [] } {
  return { pinned_posts: [] }
}

ClientRequest.prototype.put = function storybookClientRequestPut<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['put']>[2],
): Promise<T> {
  if (pinnedPostsFixture && endpoint.endsWith('/pinned-posts')) {
    return Promise.resolve(pinnedPostsResponse() as T)
  }
  return clientRequestPut.call(this, endpoint, body, options) as Promise<T>
}

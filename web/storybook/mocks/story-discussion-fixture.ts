import { ClientRequest } from '@/lib/api/client/request'

let storyDiscussionFixture = false
const clientRequestPost = ClientRequest.prototype.post

export function setStoryDiscussionFixture(): void {
  storyDiscussionFixture = true
}

export function clearStoryDiscussionFixture(): void {
  storyDiscussionFixture = false
}

function storyDiscussionResponse() {
  return {
    post: {
      id: 'discussion-transfer-bonus',
      post_type: 'discussion',
      slug: 'transfer-bonus-discussion',
      title: 'Discuss the transfer bonus',
    },
    story: { id: 'story-transfer-bonus' },
  }
}

ClientRequest.prototype.post = function storybookClientRequestPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  if (storyDiscussionFixture && /\/api\/v1\/stories\/[^/]+\/discussions$/.test(endpoint)) {
    return Promise.resolve(storyDiscussionResponse() as T)
  }
  return clientRequestPost.call(this, endpoint, body, options) as Promise<T>
}

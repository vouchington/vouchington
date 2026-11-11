import { ClientRequest } from '@vouchington/api-client'

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
      post_type: 'story',
      slug: 'transfer-bonus-discussion',
      title: 'Discuss the transfer bonus',
    },
  }
}

ClientRequest.prototype.post = function storybookClientRequestPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  if (
    storyDiscussionFixture &&
    endpoint === '/api/v1/posts' &&
    (body as { post_type?: string } | undefined)?.post_type === 'story'
  ) {
    return Promise.resolve(storyDiscussionResponse() as T)
  }
  return clientRequestPost.call(this, endpoint, body, options) as Promise<T>
}

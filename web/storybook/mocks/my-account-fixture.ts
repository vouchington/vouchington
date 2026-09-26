import { ClientRequest } from '@/lib/api/client/request'
import { updatedLandingPage } from '@/storybook/mocks/my-account-landing'
import { accountImageState, accountPost } from '@/storybook/mocks/my-account-routes'

let myAccountFixture = false
const previousGet = ClientRequest.prototype.get
const previousPost = ClientRequest.prototype.post
const previousPatch = ClientRequest.prototype.patch
const previousPut = ClientRequest.prototype.put
const previousDelete = ClientRequest.prototype.delete
const previousFetch = globalThis.fetch
const previousAnchorClick = HTMLAnchorElement.prototype.click

export function setMyAccountFixture(): void {
  myAccountFixture = true
}

export function clearMyAccountFixture(): void {
  myAccountFixture = false
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

globalThis.fetch = function storybookMyAccountFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = requestUrl(input)
  if (
    myAccountFixture &&
    (url.includes('storybook.invalid/upload') ||
      (url.includes('/api/v1/my/export/') && url.includes('preflight=1')))
  ) {
    return Promise.resolve(new Response(null, { status: 200 }))
  }
  return previousFetch.call(globalThis, input, init)
}

HTMLAnchorElement.prototype.click = function storybookExportClick(this: HTMLAnchorElement) {
  if (myAccountFixture && this.href.includes('/api/v1/my/export/')) return
  previousAnchorClick.call(this)
}

ClientRequest.prototype.get = function storybookMyAccountGet<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['get']>[1],
): Promise<T> {
  if (!myAccountFixture) return previousGet.call(this, endpoint, options) as Promise<T>
  if (endpoint === '/api/v1/availability') {
    return Promise.resolve({ available: true, conflict: null } as T)
  }
  const imageState = accountImageState(endpoint)
  if (imageState !== undefined) return Promise.resolve(imageState as T)
  return previousGet.call(this, endpoint, options) as Promise<T>
}

ClientRequest.prototype.post = function storybookMyAccountPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  const response = myAccountFixture ? accountPost(endpoint, body) : undefined
  if (response !== undefined) return Promise.resolve(response as T)
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.patch = function storybookMyAccountPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['patch']>[2],
): Promise<T> {
  if (!myAccountFixture) return previousPatch.call(this, endpoint, body, options) as Promise<T>
  if (
    endpoint === '/api/v1/my/profile' ||
    endpoint === '/api/v1/my/identity' ||
    /^\/api\/v1\/auth\/(?:passkeys|totp)\/[^/]+$/.test(endpoint)
  ) {
    return Promise.resolve({} as T)
  }
  if (/^\/api\/v1\/my\/landing-pages\/[^/]+$/.test(endpoint)) {
    return Promise.resolve({ landing_page: updatedLandingPage(body) } as T)
  }
  return previousPatch.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.put = function storybookMyAccountPut<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['put']>[2],
): Promise<T> {
  if (myAccountFixture && /^\/api\/v1\/my\/landing-pages\/[^/]+\/items$/.test(endpoint)) {
    return Promise.resolve({ landing_page: updatedLandingPage(body) } as T)
  }
  return previousPut.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.delete = function storybookMyAccountDelete<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['delete']>[1],
): Promise<T> {
  if (
    myAccountFixture &&
    (/^\/api\/v1\/my\/landing-pages\/[^/]+$/.test(endpoint) ||
      /^\/api\/v1\/my\/api-keys\/[^/]+$/.test(endpoint) ||
      /^\/api\/v1\/auth\/(?:passkeys|totp)\/[^/]+$/.test(endpoint))
  ) {
    return Promise.resolve(undefined as T)
  }
  return previousDelete.call(this, endpoint, options) as Promise<T>
}

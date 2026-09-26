import { ClientRequest } from '@/lib/api/client/request'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import type { LandingPageWithItems } from '@/types/landing-pages'

let myAccountFixture = false
const previousGet = ClientRequest.prototype.get
const previousPost = ClientRequest.prototype.post
const previousPatch = ClientRequest.prototype.patch
const previousPut = ClientRequest.prototype.put
const previousDelete = ClientRequest.prototype.delete
const previousFetch = globalThis.fetch

export function setMyAccountFixture(): void {
  myAccountFixture = true
}

export function clearMyAccountFixture(): void {
  myAccountFixture = false
}

function record(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

function topicNames(body: unknown): string[] {
  const names = record(body).names
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string')
    : []
}

function updatedLandingPage(body: unknown): LandingPageWithItems {
  const fields = record(body)
  return {
    ...landingPageWithItems,
    title: typeof fields.title === 'string' ? fields.title : landingPageWithItems.title,
    subtitle:
      typeof fields.subtitle === 'string' || fields.subtitle === null
        ? fields.subtitle
        : landingPageWithItems.subtitle,
    slug: typeof fields.slug === 'string' ? fields.slug : landingPageWithItems.slug,
    is_default: fields.is_default === true || landingPageWithItems.is_default,
  }
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
  if (myAccountFixture && url.includes('/api/v1/my/export/') && url.includes('preflight=1')) {
    return Promise.resolve(new Response(null, { status: 200 }))
  }
  return previousFetch.call(globalThis, input, init)
}

ClientRequest.prototype.get = function storybookMyAccountGet<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['get']>[1],
): Promise<T> {
  if (myAccountFixture && endpoint === '/api/v1/availability') {
    return Promise.resolve({ available: true, conflict: null } as T)
  }
  return previousGet.call(this, endpoint, options) as Promise<T>
}

ClientRequest.prototype.post = function storybookMyAccountPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  if (myAccountFixture && endpoint === '/api/v1/my/import/topics') {
    return Promise.resolve({
      results: topicNames(body).map(input => ({ input, status: 'followed' })),
    } as T)
  }
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}

ClientRequest.prototype.patch = function storybookMyAccountPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['patch']>[2],
): Promise<T> {
  if (!myAccountFixture) return previousPatch.call(this, endpoint, body, options) as Promise<T>
  if (endpoint === '/api/v1/my/profile' || endpoint === '/api/v1/my/identity') {
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
  if (myAccountFixture && /^\/api\/v1\/my\/landing-pages\/[^/]+$/.test(endpoint)) {
    return Promise.resolve(undefined as T)
  }
  return previousDelete.call(this, endpoint, options) as Promise<T>
}

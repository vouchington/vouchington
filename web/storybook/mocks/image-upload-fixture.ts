import { ClientRequest } from '@/lib/api/client/request'

const imageUploadUrl = 'http://127.0.0.1/storybook-image-upload'
let imageUploads = false
const previousGet = ClientRequest.prototype.get
const previousFetch = globalThis.fetch

export function setImageUploadFixture(): void {
  imageUploads = true
}

export function clearImageUploadFixture(): void {
  imageUploads = false
}

ClientRequest.prototype.get = function storybookImageUploadGet<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['get']>[1],
): Promise<T> {
  if (imageUploads && endpoint.endsWith('/upload-state')) {
    const imageId = endpoint.split('/')[4] ?? 'image-story'
    return Promise.resolve({
      upload_state: {
        id: imageId,
        upload_status: 'complete',
        upload_error: null,
        ready: true,
        blocked: false,
      },
    } as T)
  }
  return previousGet.call(this, endpoint, options) as Promise<T>
}

globalThis.fetch = function storybookImageUploadFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (imageUploads && requestUrl(input) === imageUploadUrl) {
    return Promise.resolve(new Response(null, { status: 200 }))
  }
  return previousFetch.call(globalThis, input, init)
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

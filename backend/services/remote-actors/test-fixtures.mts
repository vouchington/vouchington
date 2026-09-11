/**
 * Test-only fixtures shared across this package's own test files (get-or-fetch.test.mts and
 * siblings): building a fake JSON `Response` and wrapping it in the `{ response, responseSignal }`
 * pair `fetchWithTimeout` resolves. Kept local rather than in `@voucha/test-helpers` — every
 * backend service devDeps test-helpers for its own tests, so a test-helpers -> @services/remote-actors
 * edge would be a workspace cycle (mirrors ap-inbox-activities/test-fixtures.mts).
 */

import { generateRsaSha256KeyPair } from '@modules/http-signatures'

export const VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM = generateRsaSha256KeyPair().publicKeyPem
export const ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM = generateRsaSha256KeyPair().publicKeyPem

export function makeJsonResponse(body: unknown, status = 200): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(stream, { status })
}

/** Wraps a fake response in the `{ response, responseSignal }` pair `fetchWithTimeout` now resolves. */
export function fetchWithTimeoutResult(response: Response): {
  response: Response
  responseSignal: AbortSignal
} {
  return { response, responseSignal: new AbortController().signal }
}

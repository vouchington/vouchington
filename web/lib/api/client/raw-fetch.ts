'use client'

export function clientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Raw browser fetch is centralized here so callers outside web/lib/api/** import API helpers instead.
  if (init === undefined) return fetch(input)
  // Raw browser fetch is centralized here so callers outside web/lib/api/** import API helpers instead.
  return fetch(input, init)
}

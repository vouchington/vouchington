import { vi } from 'vitest'

type WebApiTestServer = {
  close: (callback: () => void) => void
}

export type WebApiClientRuntimeRestore = {
  backendServer: WebApiTestServer
  previousFetch: typeof globalThis.fetch
}

export async function closeWebApiClientRuntime(state: WebApiClientRuntimeRestore): Promise<void> {
  await new Promise<void>(resolve => {
    state.backendServer.close(() => resolve())
  })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  globalThis.fetch = state.previousFetch
}

export async function withWebApiClientRuntime<T>(options: {
  cookieHeader?: { Cookie?: string }
  setActive: (active: boolean, cookie: string | undefined) => void
  run: () => Promise<T>
}): Promise<T> {
  options.setActive(true, options.cookieHeader?.Cookie)
  vi.stubGlobal('window', {})
  try {
    return await options.run()
  } finally {
    options.setActive(false, undefined)
    vi.unstubAllGlobals()
  }
}

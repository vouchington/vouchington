type WebApiTestServer = {
  close: (callback: () => void) => void
}

export type WebApiEnvUnset = (target: object, key: string) => void

export type WebApiClientRuntimeRestore = {
  backendServer: WebApiTestServer
  previousApiBaseUrl: string | undefined
  previousPublicApiBaseUrl: string | undefined
  previousFetch: typeof globalThis.fetch
  hadWindow: boolean
  previousWindow: unknown
  unset: WebApiEnvUnset
}

export async function closeWebApiClientRuntime(state: WebApiClientRuntimeRestore): Promise<void> {
  await new Promise<void>(resolve => {
    state.backendServer.close(() => resolve())
  })
  if (state.previousApiBaseUrl === undefined) {
    state.unset(process.env, 'API_BASE_URL')
  } else {
    process.env.API_BASE_URL = state.previousApiBaseUrl
  }
  if (state.previousPublicApiBaseUrl === undefined) {
    state.unset(process.env, 'NEXT_PUBLIC_API_BASE_URL')
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = state.previousPublicApiBaseUrl
  }
  globalThis.fetch = state.previousFetch
  if (state.hadWindow) {
    ;(globalThis as { window?: unknown }).window = state.previousWindow
  } else {
    state.unset(globalThis, 'window')
  }
}

export async function withWebApiClientRuntime<T>(options: {
  hadWindow: boolean
  previousWindow: unknown
  cookieHeader?: { Cookie?: string }
  setActive: (active: boolean, cookie: string | undefined) => void
  unset: WebApiEnvUnset
  run: () => Promise<T>
}): Promise<T> {
  options.setActive(true, options.cookieHeader?.Cookie)
  ;(globalThis as { window?: unknown }).window = {}
  try {
    return await options.run()
  } finally {
    options.setActive(false, undefined)
    if (options.hadWindow) {
      ;(globalThis as { window?: unknown }).window = options.previousWindow
    } else {
      options.unset(globalThis, 'window')
    }
  }
}

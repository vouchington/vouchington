import type { BrowserContext } from '@playwright/test'

export interface ExpectedServerError {
  pattern: RegExp
  reason: string
}

export interface UiErrorMonitorOptions {
  allowErrorPage?: string
  allowErrorToasts?: string
  expectedServerErrors?: ExpectedServerError[]
}

interface UiErrorRecord {
  kind: 'error-page' | 'error-toast'
  text: string
  url: string
}

interface ObservedResponse {
  request(): { resourceType(): string }
  status(): number
  url(): string
}

const RECORD_BINDING = '__vouchaRecordUiError'

// Markers: sonner renders error toasts as `[data-sonner-toast][data-type="error"]`; the route and
// global error boundaries render AppErrorPanel with these data-pw roots. Inline form validation
// has other markers, so a test that triggers it on purpose is not flagged. Observing mutations
// also catches toasts that auto-dismiss before the test could look for them.
const observerScript = `(() => {
  const record = window.${RECORD_BINDING}
  if (!record) return
  const seen = new WeakSet()
  const toastSelector = '[data-sonner-toast][data-type="error"]'
  const pageSelector = '[data-pw="error-page"],[data-pw="global-error-page"]'
  const scan = root => {
    if (!(root instanceof Element)) return
    const found = [
      ['error-toast', root.matches(toastSelector) ? [root] : [...root.querySelectorAll(toastSelector)]],
      ['error-page', root.matches(pageSelector) ? [root] : [...root.querySelectorAll(pageSelector)]],
    ]
    for (const [kind, elements] of found) {
      for (const element of elements) {
        if (seen.has(element)) continue
        seen.add(element)
        record({ kind, text: (element.textContent || '').trim().slice(0, 300), url: location.href })
      }
    }
  }
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      scan(mutation.target)
      for (const node of mutation.addedNodes) scan(node)
    }
  })
  const start = () => {
    scan(document.documentElement)
    observer.observe(document.documentElement, {
      attributeFilter: ['data-type', 'data-pw'],
      attributes: true,
      childList: true,
      subtree: true,
    })
  }
  if (document.documentElement) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })
})()`

function isLocalOrigin(url: string): boolean {
  const { hostname } = new URL(url)
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export async function monitorUiErrors(
  context: BrowserContext,
  { allowErrorPage, allowErrorToasts, expectedServerErrors = [] }: UiErrorMonitorOptions,
) {
  const uiErrors: UiErrorRecord[] = []
  const serverErrors: string[] = []

  const onResponse = (response: ObservedResponse) => {
    const url = response.url()
    if (response.status() < 500 || !isLocalOrigin(url)) return
    if (expectedServerErrors.some(({ pattern }) => pattern.test(url))) return
    serverErrors.push(`${response.status()} ${response.request().resourceType()} ${url}`)
  }
  context.on('response', onResponse)
  await context.exposeBinding(RECORD_BINDING, (_source, record: UiErrorRecord) => {
    uiErrors.push(record)
  })
  await context.addInitScript(observerScript)

  return {
    failures() {
      context.off('response', onResponse)
      const failures = serverErrors.map(entry => `Same-origin 5xx response: ${entry}`)
      for (const { kind, text, url } of uiErrors) {
        if (kind === 'error-page' ? allowErrorPage : allowErrorToasts) continue
        failures.push(
          kind === 'error-page'
            ? `Error boundary page rendered at ${url}: ${text}`
            : `Error toast shown at ${url}: ${text}`,
        )
      }
      return failures
    },
  }
}

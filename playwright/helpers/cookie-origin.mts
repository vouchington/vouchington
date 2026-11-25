import { test } from './test.mts'

type TestInfoSource = () => { project: { use: { baseURL?: string } } }

/**
 * Origin for cookies injected before the first navigation. Read from the project's baseURL so
 * helpers need no `page.goto('/')`, which costs a full SSR render plus a redirect per call.
 */
export function cookieOrigin(testInfo: TestInfoSource = () => test.info()): string {
  const baseURL = testInfo().project.use.baseURL
  if (!baseURL) throw new TypeError('cookieOrigin: the Playwright project has no baseURL')
  return new URL(baseURL).origin
}

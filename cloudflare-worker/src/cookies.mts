import { assertSafeSessionCookieValue } from '@ts-shared/session-jwt'
import { parseCookies } from '@ts-shared/utils/cookies'

export { parseCookies }

export const replaceSessionCookies = (
  cookieHeader: string | null | undefined,
  replacements: { dt?: string; st?: string },
): string => {
  const cookies = parseCookies(cookieHeader)
  if (replacements.dt !== undefined) {
    assertSafeSessionCookieValue('dt', replacements.dt)
    cookies.set('dt', replacements.dt)
  }
  if (replacements.st !== undefined) {
    assertSafeSessionCookieValue('st', replacements.st)
    cookies.set('st', replacements.st)
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

export const stripCookies = (
  cookieHeader: string | null | undefined,
  cookieNamesToStrip: Set<string>,
): string | null => {
  const cookies = parseCookies(cookieHeader)

  for (const cookieName of cookieNamesToStrip) {
    cookies.delete(cookieName)
  }

  if (cookies.size === 0) {
    return null
  }

  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

import { assertSafeSessionCookieValue } from '@ts-shared/session-jwt'
import { replaceCookies } from '@vouchington/edge'

export const replaceSessionCookies = (
  cookieHeader: string | null | undefined,
  replacements: { dt?: string; st?: string },
): string =>
  replaceCookies(cookieHeader, replacements, (name, value) => {
    assertSafeSessionCookieValue(name as 'st' | 'dt', value)
  })

import { expect } from 'vitest'
import { verifyDeviceAndSessionTokens } from '../services/jwt-session/verify.mts'
import applyContext from '../api/context/index.mts'
import type { Application, Context, CookieOptions } from '@jongleberry/api-server'

export type CookieWrite = {
  name: string
  value: string
  options?: CookieOptions
}

const contextExtensions: Record<string, unknown> = {}
const contextApplicationAdapter = {
  extend(methods: Record<string, unknown>) {
    Object.assign(contextExtensions, methods)
  },
}
applyContext(contextApplicationAdapter as unknown as Application)

export function createRequestContext(
  cookies: Readonly<Partial<Record<string, string>>> = {},
  request: Context['req'] = { headers: {} } as Context['req'],
): { context: Context; cookieWrites: CookieWrite[] } {
  const incomingCookies = Object.freeze({ ...cookies })
  const cookieWrites: CookieWrite[] = []
  const context = {
    req: request,
    cookies: {
      get(name: string): string | undefined {
        return incomingCookies[name]
      },
      set(name: string, value: string, options?: CookieOptions): void {
        cookieWrites.push({ name, value, options })
      },
    },
  } as unknown as Context
  Object.assign(context, contextExtensions)
  return { context, cookieWrites }
}

export function getOnlyCookieWrite(cookieWrites: CookieWrite[], name: string): CookieWrite {
  const matchingWrites = cookieWrites.filter(write => write.name === name)
  expect(matchingWrites).toHaveLength(1)
  return matchingWrites[0]!
}

export async function verifyOnlyCookiePair(cookieWrites: CookieWrite[]) {
  expect(cookieWrites).toHaveLength(2)
  const result = await verifyDeviceAndSessionTokens({
    deviceToken: getOnlyCookieWrite(cookieWrites, 'dt').value,
    sessionToken: getOnlyCookieWrite(cookieWrites, 'st').value,
  })
  expect(result).not.toBe(false)
  if (!result) throw new Error('Expected replacement authentication cookies to verify')
  return result
}

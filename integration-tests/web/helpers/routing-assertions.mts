import { expect } from 'vitest'
import { createTestAuthCookies } from './auth.mts'
import type { WebIntegrationClient } from './client.mts'
import { TEST_USER_ID } from './constants.mts'

export async function getManualRedirectLocation(
  client: WebIntegrationClient,
  path: string,
): Promise<string> {
  const response = await client.request(path, { redirect: 'manual' })
  expect(response.status).toBeGreaterThanOrEqual(300)
  expect(response.status).toBeLessThan(400)
  return response.headers.get('location') ?? ''
}

export async function expectManualRedirectMatches(
  client: WebIntegrationClient,
  path: string,
  expectedLocation: RegExp,
): Promise<void> {
  expect(await getManualRedirectLocation(client, path)).toMatch(expectedLocation)
}

export async function expectManualRedirectPath(
  client: WebIntegrationClient,
  workerOrigin: string,
  path: string,
  expectedPathname: string,
): Promise<void> {
  const location = await getManualRedirectLocation(client, path)
  const redirectUrl = new URL(location, workerOrigin)
  expect(redirectUrl.pathname).toBe(expectedPathname)
  expect(redirectUrl.search).toBe('')
}

export async function authenticateTestUserWithDirectSessionTokens(
  client: WebIntegrationClient,
): Promise<void> {
  const authCookies = await createTestAuthCookies(TEST_USER_ID)
  client.setCookie('dt', authCookies.dt!)
  client.setCookie('st', authCookies.st!)
}

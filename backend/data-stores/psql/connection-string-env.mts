import { resolveDatabaseConnectionString as resolvePlatformConnectionString } from '@vouchington/postgres'

export function resolveDatabaseConnectionString(
  env: Parameters<typeof resolvePlatformConnectionString>[0] = process.env,
): string {
  return resolvePlatformConnectionString(env, 'voucha')
}

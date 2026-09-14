import { resolveDatabaseConnectionString as resolvePlatformConnectionString } from '@vouchington/postgres'

type DatabaseConnectionEnv = Parameters<typeof resolvePlatformConnectionString>[0]

export function resolveDatabaseConnectionString(
  env: DatabaseConnectionEnv = databaseConnectionEnv(),
): string {
  return resolvePlatformConnectionString(env, 'voucha')
}

function databaseConnectionEnv(): DatabaseConnectionEnv {
  const {
    DATABASE_HOST,
    DATABASE_NAME,
    DATABASE_PASSWORD,
    DATABASE_PORT,
    DATABASE_SSLMODE,
    DATABASE_URL,
    DATABASE_USER,
    DOCKER_HOST_IP,
  } = process.env
  return {
    DATABASE_HOST,
    DATABASE_NAME,
    DATABASE_PASSWORD,
    DATABASE_PORT,
    DATABASE_SSLMODE,
    DATABASE_URL,
    DATABASE_USER,
    DOCKER_HOST_IP,
  }
}

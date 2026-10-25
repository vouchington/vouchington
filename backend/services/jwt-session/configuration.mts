import { assertSessionJwtConfiguration, type SessionJwtEnvironment } from '@ts-shared/session-jwt'

export async function assertBackendSessionJwtConfiguration(
  env: SessionJwtEnvironment = process.env,
): Promise<void> {
  await assertSessionJwtConfiguration({ env }, { signing: true })
}

import { registerPsqlPoolMetrics } from 'vouchington-tooling/postgres-test-faults'

export async function registerCurrentPsqlPoolMetrics(): Promise<void> {
  const { writePool, readPool, advisoryLockPool, jobSerializationPool } =
    await import('../data-stores/psql/runtime.mts')
  registerPsqlPoolMetrics({
    write: writePool,
    read: readPool,
    advisoryLock: advisoryLockPool,
    jobSerialization: jobSerializationPool,
  })
}

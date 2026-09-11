import { advisoryLockPool } from '@data-stores/psql'

const IMAGE_STORAGE_LIFECYCLE_LOCK_NAMESPACE = 0x496d

/** Serialize rollback-capable image deletion with irreversible storage cleanup. */
export async function withImageStorageLifecycleLock<T>(
  imageId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const client = await advisoryLockPool.connect()
  let released = false
  try {
    await client.query(
      '/* withImageStorageLifecycleLock:lock */ SELECT pg_advisory_lock($1, hashtext($2))',
      [IMAGE_STORAGE_LIFECYCLE_LOCK_NAMESPACE, imageId],
    )
    const result = await callback()
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* withImageStorageLifecycleLock:unlock */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
      [IMAGE_STORAGE_LIFECYCLE_LOCK_NAMESPACE, imageId],
    )
    if (!rows[0]?.unlocked) {
      throw new Error(`Image storage lifecycle lock was not held for ${imageId}`)
    }
    client.release()
    released = true
    return result
  } finally {
    if (!released) client.release(true)
  }
}

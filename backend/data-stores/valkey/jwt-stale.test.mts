import { it, expect, describe } from 'vitest'
import {
  markJwtStale,
  markJwtStaleBatch,
  getJwtStaleKey,
  clearJwtStaleIfCurrent,
} from './jwt-stale.mts'
import { v7 } from 'uuid'
import { sessionValkeyClient } from './clients.mts'

describe('jwt-stale', () => {
  it('markJwtStale marks user claims as stale', async () => {
    const userId = v7()

    const marker = await markJwtStale(userId)
    expect(marker).toEqual(expect.any(String))
    expect((await sessionValkeyClient.get(getJwtStaleKey(userId)))?.toString()).toBe(marker)
  })

  it('clears the captured current stale marker', async () => {
    const userId = v7()

    const marker = await markJwtStale(userId)
    expect((await sessionValkeyClient.get(getJwtStaleKey(userId)))?.toString()).toBe(marker)

    await expect(clearJwtStaleIfCurrent(userId, marker)).resolves.toBe(true)
    expect(await sessionValkeyClient.get(getJwtStaleKey(userId))).toBeNull()
  })

  it('markJwtStale is idempotent', async () => {
    const userId = v7()

    await markJwtStale(userId)
    const marker = await markJwtStale(userId)
    expect((await sessionValkeyClient.get(getJwtStaleKey(userId)))?.toString()).toBe(marker)
  })

  it('markJwtStaleBatch marks multiple users and returns per-user markers', async () => {
    const userIdA = v7()
    const userIdB = v7()

    const markers = await markJwtStaleBatch([userIdA, userIdB, userIdA])

    expect(markers.size).toBe(2)
    expect(markers.get(userIdA)).toEqual(expect.any(String))
    expect(markers.get(userIdB)).toEqual(expect.any(String))
    expect((await sessionValkeyClient.get(getJwtStaleKey(userIdA)))?.toString()).toBe(
      markers.get(userIdA),
    )
    expect((await sessionValkeyClient.get(getJwtStaleKey(userIdB)))?.toString()).toBe(
      markers.get(userIdB),
    )

    await expect(clearJwtStaleIfCurrent(userIdA, markers.get(userIdA)!)).resolves.toBe(true)
    expect(await sessionValkeyClient.get(getJwtStaleKey(userIdA))).toBeNull()
    expect((await sessionValkeyClient.get(getJwtStaleKey(userIdB)))?.toString()).toBe(
      markers.get(userIdB),
    )
  })

  it('markJwtStaleBatch uses the single-user path for one unique user', async () => {
    const userId = v7()

    const markers = await markJwtStaleBatch([userId])

    expect(markers.size).toBe(1)
    await expect(clearJwtStaleIfCurrent(userId, markers.get(userId)!)).resolves.toBe(true)
    expect(await sessionValkeyClient.get(getJwtStaleKey(userId))).toBeNull()
  })

  it('markJwtStaleBatch does nothing for empty input', async () => {
    await expect(markJwtStaleBatch([])).resolves.toEqual(new Map())
  })

  it('conditional clear does not remove a marker for a non-stale user', async () => {
    const userId = v7()
    await expect(clearJwtStaleIfCurrent(userId, crypto.randomUUID())).resolves.toBe(false)
  })

  it('clearJwtStaleIfCurrent preserves newer stale markers', async () => {
    const userId = v7()
    const oldMarker = await markJwtStale(userId)
    const newMarker = await markJwtStale(userId)

    await expect(clearJwtStaleIfCurrent(userId, oldMarker)).resolves.toBe(false)
    expect((await sessionValkeyClient.get(getJwtStaleKey(userId)))?.toString()).toBe(newMarker)

    await expect(clearJwtStaleIfCurrent(userId, newMarker)).resolves.toBe(true)
    expect(await sessionValkeyClient.get(getJwtStaleKey(userId))).toBeNull()
  })
})

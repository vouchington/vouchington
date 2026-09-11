import { it, expect, describe } from 'vitest'
import {
  markJwtStale,
  markJwtStaleBatch,
  isJwtStale,
  clearJwtStale,
  clearJwtStaleIfCurrent,
} from './jwt-stale.mts'
import { v7 } from 'uuid'

describe('jwt-stale', () => {
  it('isJwtStale returns false for a user with no stale flag', async () => {
    const userId = v7()
    const result = await isJwtStale(userId)
    expect(result).toBe(false)
  })

  it('markJwtStale marks user claims as stale', async () => {
    const userId = v7()

    const marker = await markJwtStale(userId)
    expect(marker).toEqual(expect.any(String))
    const result = await isJwtStale(userId)
    expect(result).toBe(true)
  })

  it('clearJwtStale removes the stale flag', async () => {
    const userId = v7()

    await markJwtStale(userId)
    expect(await isJwtStale(userId)).toBe(true)

    await clearJwtStale(userId)
    expect(await isJwtStale(userId)).toBe(false)
  })

  it('markJwtStale is idempotent', async () => {
    const userId = v7()

    await markJwtStale(userId)
    await markJwtStale(userId)
    expect(await isJwtStale(userId)).toBe(true)
  })

  it('markJwtStaleBatch marks multiple users and returns per-user markers', async () => {
    const userIdA = v7()
    const userIdB = v7()

    const markers = await markJwtStaleBatch([userIdA, userIdB, userIdA])

    expect(markers.size).toBe(2)
    expect(markers.get(userIdA)).toEqual(expect.any(String))
    expect(markers.get(userIdB)).toEqual(expect.any(String))
    expect(await isJwtStale(userIdA)).toBe(true)
    expect(await isJwtStale(userIdB)).toBe(true)

    await expect(clearJwtStaleIfCurrent(userIdA, markers.get(userIdA)!)).resolves.toBe(true)
    expect(await isJwtStale(userIdA)).toBe(false)
    expect(await isJwtStale(userIdB)).toBe(true)
  })

  it('markJwtStaleBatch uses the single-user path for one unique user', async () => {
    const userId = v7()

    const markers = await markJwtStaleBatch([userId])

    expect(markers.size).toBe(1)
    await expect(clearJwtStaleIfCurrent(userId, markers.get(userId)!)).resolves.toBe(true)
    expect(await isJwtStale(userId)).toBe(false)
  })

  it('markJwtStaleBatch does nothing for empty input', async () => {
    await expect(markJwtStaleBatch([])).resolves.toEqual(new Map())
  })

  it('clearJwtStale on non-stale user does not throw', async () => {
    const userId = v7()
    await expect(clearJwtStale(userId)).resolves.not.toThrow()
  })

  it('clearJwtStaleIfCurrent preserves newer stale markers', async () => {
    const userId = v7()
    const oldMarker = await markJwtStale(userId)
    const newMarker = await markJwtStale(userId)

    await expect(clearJwtStaleIfCurrent(userId, oldMarker)).resolves.toBe(false)
    expect(await isJwtStale(userId)).toBe(true)

    await expect(clearJwtStaleIfCurrent(userId, newMarker)).resolves.toBe(true)
    expect(await isJwtStale(userId)).toBe(false)
  })
})

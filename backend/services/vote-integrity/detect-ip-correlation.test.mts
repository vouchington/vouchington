import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { detectIpCorrelation } from './detect-ip-correlation.mts'
import { recordVoteIp } from './ip-window.mts'
import { IP_CORRELATION_THRESHOLD, IP_CORRELATION_WINDOW_MINUTES } from './config.mts'

describe('vote IP correlation window', () => {
  it('counts distinct voters at the 60-minute boundary and excludes them one millisecond later', async () => {
    const entityId = randomUUID()
    const ip = '203.0.113.27'
    const asOfMs = Date.now()
    const cutoff = asOfMs - IP_CORRELATION_WINDOW_MINUTES * 60_000
    for (let index = 0; index < IP_CORRELATION_THRESHOLD; index++) {
      await recordVoteIp(
        'post',
        entityId,
        randomUUID(),
        ip,
        new Date(cutoff + (index === 0 ? 0 : 1)),
        new Date(asOfMs),
      )
    }

    const atCutoff = await detectIpCorrelation('post', entityId, ip, new Date(asOfMs))
    const afterCutoff = await detectIpCorrelation('post', entityId, ip, new Date(asOfMs + 1))
    expect(atCutoff.flagged).toBe(true)
    expect(atCutoff.details.correlated_ips).toEqual([
      { ip_address: ip, distinct_user_count: IP_CORRELATION_THRESHOLD },
    ])
    expect(afterCutoff.flagged).toBe(false)
    expect(afterCutoff.details.correlated_ips).toEqual([])
  })

  it('counts a repeated voter once and ignores votes without an IP', async () => {
    const entityId = randomUUID()
    const ip = '203.0.113.28'
    const userId = randomUUID()
    const now = new Date()
    await recordVoteIp('post', entityId, userId, ip, now)
    await recordVoteIp('post', entityId, userId, ip, now)
    await recordVoteIp('post', entityId, randomUUID(), null, now)
    const result = await detectIpCorrelation('post', entityId, ip, now)
    expect(result.flagged).toBe(false)
    expect(await detectIpCorrelation('post', entityId, null, now)).toMatchObject({ flagged: false })
  })

  it('rejects an invalid reference instant', async () => {
    await expect(
      detectIpCorrelation('post', randomUUID(), '203.0.113.29', new Date(Number.NaN)),
    ).rejects.toThrow('asOf must be a finite date')
  })
})

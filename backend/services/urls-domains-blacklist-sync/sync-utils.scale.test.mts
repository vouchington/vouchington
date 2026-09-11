import { describe, expect, it } from 'vitest'
import { readNormalizedDomains } from './sync-utils.mts'

describe('blacklist stream scale', () => {
  it('keeps producer lead bounded while reading a large streamed blacklist', async () => {
    const totalDomains = 10_000
    let produced = 0
    let consumed = 0
    let maximumProducerLead = 0
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced === totalDomains) {
          controller.close()
          return
        }

        controller.enqueue(encoder.encode(`scale-${produced}.example\n`))
        produced += 1
        maximumProducerLead = Math.max(maximumProducerLead, produced - consumed)
      },
    })

    for await (const domain of readNormalizedDomains(new Response(body))) {
      expect(domain).toBe(`scale-${consumed}.example`)
      consumed += 1
    }

    expect(consumed).toBe(totalDomains)
    expect(maximumProducerLead).toBeLessThan(1_024)
  })
})

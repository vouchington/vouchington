import type http from 'node:http'

export const ASSET_CONCURRENCY_PATH = '/__trace/asset-concurrency-slot'

interface Lease {
  granted: boolean
  response: http.ServerResponse
}

export function createAssetConcurrencyBroker(limit: number) {
  const waiting: Lease[] = []
  let active = 0

  function grant(lease: Lease): void {
    lease.granted = true
    active++
    lease.response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/octet-stream',
    })
    lease.response.write('granted')
  }

  function grantNext(): void {
    let lease = waiting.shift()
    while (lease?.response.destroyed) lease = waiting.shift()
    if (lease) grant(lease)
  }

  return {
    handle(path: string, response: http.ServerResponse): boolean {
      if (path !== ASSET_CONCURRENCY_PATH) return false
      const lease: Lease = { granted: false, response }
      response.once('close', () => {
        if (lease.granted) {
          active--
          grantNext()
          return
        }
        const index = waiting.indexOf(lease)
        if (index >= 0) waiting.splice(index, 1)
      })
      if (active < limit) grant(lease)
      else waiting.push(lease)
      return true
    },
  }
}

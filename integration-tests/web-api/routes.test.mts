import { EventEmitter } from 'node:events'
import type http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'

import { listenOnFetchSafeLoopback } from './routes.mts'

class SequencedPortServer extends EventEmitter {
  readonly closeStarted: Promise<void>
  readonly events: string[] = []
  readonly #ports: number[]
  #currentPort = 0
  #pendingClose: ((error?: Error) => void) | undefined
  #resolveCloseStarted: () => void

  constructor(ports: number[]) {
    super()
    this.#ports = [...ports]
    let resolveCloseStarted!: () => void
    this.closeStarted = new Promise<void>(resolve => {
      resolveCloseStarted = resolve
    })
    this.#resolveCloseStarted = resolveCloseStarted
  }

  listen(_port: number, _host: string, callback: () => void): this {
    const port = this.#ports.shift()
    if (port === undefined) throw new Error('No port configured for test server')
    this.#currentPort = port
    this.events.push(`bind:${port}`)
    queueMicrotask(callback)
    return this
  }

  address(): AddressInfo {
    this.events.push(`inspect:${this.#currentPort}`)
    return {
      address: '127.0.0.1',
      family: 'IPv4',
      port: this.#currentPort,
    }
  }

  close(callback?: (error?: Error) => void): this {
    this.events.push(`close-start:${this.#currentPort}`)
    this.#pendingClose = callback
    this.#resolveCloseStarted()
    return this
  }

  completeClose(): void {
    if (!this.#pendingClose) throw new Error('No close callback is pending')
    const callback = this.#pendingClose
    this.#pendingClose = undefined
    this.events.push(`close-complete:${this.#currentPort}`)
    callback()
  }
}

describe('listenOnFetchSafeLoopback', () => {
  it('closes a fetch-blocked port before binding and inspecting the retry', async () => {
    const server = new SequencedPortServer([4045, 12_345])

    const listening = listenOnFetchSafeLoopback(server as unknown as http.Server)

    await server.closeStarted
    expect(server.events).toEqual(['bind:4045', 'inspect:4045', 'close-start:4045'])
    server.completeClose()

    await expect(listening).resolves.toBe('http://127.0.0.1:12345')
    expect(server.events).toEqual([
      'bind:4045',
      'inspect:4045',
      'close-start:4045',
      'close-complete:4045',
      'bind:12345',
      'inspect:12345',
    ])
  })
})

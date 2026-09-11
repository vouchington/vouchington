import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockWriteStream = EventEmitter & {
  closed: boolean
  destroyed: boolean
  end: () => void
  endCalls: number
  off: EventEmitter['off']
  on: EventEmitter['on']
  write: (chunk: string | Uint8Array) => boolean
}

const { createWriteStreamMock } = vi.hoisted(() => ({
  createWriteStreamMock: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: vi.fn<VitestLooseMock>(),
    createWriteStream: createWriteStreamMock,
  }
})

describe('mergeCsvFiles', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('ends the output stream when header fallback write throws', async () => {
    const stream = new EventEmitter() as MockWriteStream
    stream.closed = false
    stream.destroyed = false
    stream.endCalls = 0
    stream.write = () => {
      throw new Error('write failed')
    }
    stream.end = () => {
      stream.endCalls += 1
      stream.closed = true
      stream.emit('close')
    }

    createWriteStreamMock.mockReturnValue(stream)
    const { mergeCsvFiles } = await import('../export.mts')

    await expect(
      mergeCsvFiles('/tmp/out.csv', [], 'object_id,predicate,created_at\n'),
    ).rejects.toThrow('write failed')
    expect(stream.endCalls).toBe(1)
  })
})

describe('writeCsvFromGenerator', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('does not create the output stream when rows.next() rejects', async () => {
    const rows = {
      next: vi.fn<VitestLooseMock>().mockRejectedValue(new Error('cursor failed')),
      [Symbol.asyncIterator]() {
        return this
      },
    } as unknown as AsyncGenerator<Record<string, unknown>>
    const { writeCsvFromGenerator } = await import('../export.mts')

    await expect(writeCsvFromGenerator('/tmp/out.csv', rows)).rejects.toThrow('cursor failed')
    expect(createWriteStreamMock).not.toHaveBeenCalled()
  })
})

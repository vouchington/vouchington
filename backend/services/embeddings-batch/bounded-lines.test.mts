import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { boundedLines } from './bounded-lines.mts'

describe('bounded embedding JSONL streams', () => {
  it('preserves split UTF-8 characters and the final unterminated line', async () => {
    const bytes = Buffer.from('café\r\nlast')
    const source = Readable.from([bytes.subarray(0, 4), bytes.subarray(4, 7), bytes.subarray(7)])
    const lines = []
    for await (const line of boundedLines(source, 6, bytes.length)) lines.push(line)
    expect(lines).toEqual(['café', 'last'])
  })

  it('rejects both an oversized unfinished line and excess total bytes', async () => {
    const consume = async (lineLimit: number, totalLimit: number) => {
      for await (const line of boundedLines(
        Readable.from([Buffer.from('abc\ndef')]),
        lineLimit,
        totalLimit,
      )) {
        void line
      }
    }
    await expect(consume(2, 20)).rejects.toThrow('line exceeded')
    await expect(consume(20, 6)).rejects.toThrow('byte limit')
  })
})

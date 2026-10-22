import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { linesOf } from './feed-list-lines.mts'

describe('linesOf', () => {
  it('keeps a multibyte character split across the 64 KiB read', async () => {
    const character = Buffer.from('😀')
    expect(character).toHaveLength(4)
    const directory = mkdtempSync(join(tmpdir(), 'kagi-lines-'))
    const path = join(directory, 'deduped')
    try {
      writeFileSync(
        path,
        Buffer.concat([Buffer.alloc(64 * 1024 - 1, 0x61), character, Buffer.from('\n')]),
      )
      const lines: string[] = []
      for await (const line of linesOf(path)) lines.push(line)
      expect(lines).toEqual([`${'a'.repeat(64 * 1024 - 1)}😀`])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

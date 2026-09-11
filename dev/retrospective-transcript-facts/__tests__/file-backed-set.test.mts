import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { FileBackedSet } from '../file-backed-set.mts'

describe('FileBackedSet', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'file-backed-set-test-'))
    roots.push(root)
    return root
  }

  it('uses one temporary SQLite artifact, batches exact membership, and cleans it up', async () => {
    const root = await temporaryRoot()
    const [first, second] = await FileBackedSet.createMany(['first', 'second'], root)
    const [directory] = await readdir(root)

    for (let index = 0; index < 300; index += 1) {
      await expect(first!.add(`value-${index}`)).resolves.toBe(true)
    }
    await expect(first!.add('value-42')).resolves.toBe(false)
    await expect(second!.add('value-42')).resolves.toBe(true)
    await expect(readdir(join(root, directory!))).resolves.toEqual(
      expect.arrayContaining(['membership.sqlite']),
    )

    await first!.dispose()
    await second!.dispose()
    await expect(readdir(root)).resolves.toEqual([])
  })
})

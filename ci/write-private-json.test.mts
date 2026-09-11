import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { writePrivateJson } from './write-private-json.mts'

describe('writePrivateJson', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { force: true, recursive: true })
  })

  it('writes formatted JSON', async () => {
    directory = await mkdtemp(join(tmpdir(), 'write-private-json-'))
    const path = join(directory, 'private.json')

    await writePrivateJson(path, { token: 'redacted' })

    await expect(readFile(path, 'utf8')).resolves.toBe('{\n  "token": "redacted"\n}\n')
  })

  it('propagates serialization errors without writing data', async () => {
    directory = await mkdtemp(join(tmpdir(), 'write-private-json-'))
    const path = join(directory, 'private.json')
    const circular: { self?: unknown } = {}
    circular.self = circular

    await expect(writePrivateJson(path, circular)).rejects.toThrow('circular')
    await expect(readFile(path, 'utf8')).resolves.toBe('')
  })
})

import { access, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

import { withTempBodyFile } from './temp-body-file.mts'

describe('withTempBodyFile', () => {
  it('removes the temporary directory after the callback succeeds', async () => {
    let directory: string | undefined

    const result = await withTempBodyFile('body', async filePath => {
      directory = dirname(filePath)
      await expect(readFile(filePath, 'utf8')).resolves.toBe('body')
      return 'handled'
    })

    expect(result).toBe('handled')
    await expect(access(directory!)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes the temporary directory after the callback throws', async () => {
    let directory: string | undefined

    await expect(
      withTempBodyFile('body', async filePath => {
        directory = dirname(filePath)
        throw new Error('callback failed')
      }),
    ).rejects.toThrow('callback failed')

    await expect(access(directory!)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

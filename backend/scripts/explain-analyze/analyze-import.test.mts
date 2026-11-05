import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('explain analyze CLI import', () => {
  it('does not read the output corpus, write a summary, or exit when imported', async () => {
    const outputDir = join(import.meta.dirname, 'output')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('CLI exited while imported')
    })
    const original = fs.readdirSync
    const readDir = vi.spyOn(fs, 'readdirSync')
    readDir.mockImplementation((...args) => {
      if (String(args[0]) === outputDir)
        throw new Error('CLI read its output corpus while imported')
      return original(...args)
    })
    syncBuiltinESMExports()
    try {
      await expect(import('./analyze.mts')).resolves.toBeDefined()
      expect(readDir.mock.calls.filter(([path]) => String(path) === outputDir)).toHaveLength(0)
      expect(log).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(exit).not.toHaveBeenCalled()
    } finally {
      readDir.mockRestore()
      syncBuiltinESMExports()
      exit.mockRestore()
      error.mockRestore()
      log.mockRestore()
    }
  })
})

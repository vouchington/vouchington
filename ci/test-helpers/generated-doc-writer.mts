import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

type GeneratedDocWriterCase = {
  check: (docPath: string) => Promise<void>
  commandPattern: RegExp
  filename: string
  fixture: string
  staleToken: string
  tempPrefix: string
  title: string
  write: (docPath: string) => Promise<void>
}

/** Shared temp-file write and check cases for one regenerated markdown table. */
export function registerGeneratedDocWriteCases({
  check,
  commandPattern,
  filename,
  fixture,
  staleToken,
  tempPrefix,
  title,
  write,
}: GeneratedDocWriterCase): void {
  // oxlint-disable-next-line jest/valid-title, vitest/valid-title -- each caller passes its own suite name so the four cases stay one copy
  describe(title, () => {
    const paths: string[] = []

    async function tempDocPath(content: string): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), tempPrefix))
      const docPath = join(dir, filename)
      await writeFile(docPath, content)
      paths.push(docPath)
      return docPath
    }

    afterEach(async () => {
      await Promise.all(
        paths.splice(0).map(docPath => rm(join(docPath, '..'), { force: true, recursive: true })),
      )
    })

    it('writes the regenerated table to docPath', async () => {
      const docPath = await tempDocPath(fixture)

      await write(docPath)

      const written = await readFile(docPath, 'utf8')
      expect(written).not.toContain(staleToken)
      expect(written).toContain('Some prose that must survive regeneration untouched.')
    })

    it('resolves without throwing in check mode once the file has been regenerated', async () => {
      const docPath = await tempDocPath(fixture)
      await write(docPath)

      await expect(check(docPath)).resolves.toBeUndefined()
    })

    it('throws naming the stale docPath and the regenerate command when content has drifted', async () => {
      const docPath = await tempDocPath(fixture)

      await expect(check(docPath)).rejects.toThrow(docPath)
      await expect(check(docPath)).rejects.toThrow(commandPattern)
    })

    it('does not write the file in check mode, even when it is stale', async () => {
      const docPath = await tempDocPath(fixture)

      await expect(check(docPath)).rejects.toThrow(/stale/)
      const untouched = await readFile(docPath, 'utf8')
      expect(untouched).toBe(fixture)
    })
  })
}

import { mkdtempDisposable, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function withTempBodyFile<T>(
  body: string,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  await using dir = await mkdtempDisposable(join(tmpdir(), 'pr-description-'))
  const filePath = join(dir.path, 'body.md')
  await writeFile(filePath, body, 'utf8')
  return await fn(filePath)
}

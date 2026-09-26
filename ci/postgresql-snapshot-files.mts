import { lstat, readdir } from 'node:fs/promises'
import { join, posix } from 'node:path'

export async function regularSnapshotFiles(root: string): Promise<string[]> {
  const result: string[] = []
  async function visit(relative: string): Promise<void> {
    for (const entry of await readdir(join(root, relative))) {
      const path = posix.join(relative, entry)
      const status = await lstat(join(root, path))
      if (status.isDirectory()) await visit(path)
      else if (status.isFile()) result.push(path)
      else throw new Error(`Snapshot artifact contains a link or special file: ${path}`)
    }
  }
  await visit('')
  return result.sort()
}

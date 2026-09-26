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

export async function assertSafeSnapshotDestination(root: string, relative: string): Promise<void> {
  const rootStatus = await lstat(root)
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    throw new Error('Unsafe snapshot checkout root')
  }
  let current = root
  for (const part of relative.split('/')) {
    current = join(current, part)
    try {
      const status = await lstat(current)
      const isLeaf = current === join(root, relative)
      if (status.isSymbolicLink() || (isLeaf ? !status.isFile() : !status.isDirectory())) {
        throw new Error(`Unsafe snapshot destination: ${relative}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

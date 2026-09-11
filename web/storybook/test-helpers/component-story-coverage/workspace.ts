import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { componentRoot, repoRoot, sourceExtensions, storybookRoot } from './source'

function sourceFilesUnder(root: string): string[] {
  const absoluteRoot = path.join(repoRoot, root)
  if (!existsSync(absoluteRoot)) return []

  const files: string[] = []
  const queue = [root]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const entry of readdirSync(path.join(repoRoot, current), { withFileTypes: true })) {
      const child = path.posix.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(child)
      } else if (isSourceFile(child)) {
        files.push(child)
      }
    }
  }

  return files.toSorted()
}

export function workspaceFiles(): string[] {
  return [...sourceFilesUnder(componentRoot), ...sourceFilesUnder(storybookRoot)]
}
function isSourceFile(file: string): boolean {
  return sourceExtensions.some(extension => file.endsWith(extension))
}

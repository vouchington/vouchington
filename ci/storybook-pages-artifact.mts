import { lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const DEFAULT_MAX_FILES = 20_000
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024
const RESERVED_PAGES_PATHS = new Set([
  '.git',
  '.wrangler',
  '_headers',
  '_redirects',
  '_routes.json',
  '_worker.js',
  'functions',
  'node_modules',
])

type ArtifactLimits = {
  maxFileBytes?: number
  maxFiles?: number
  maxTotalBytes?: number
}

export function validateStorybookArtifact(
  artifactRoot: string,
  {
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    maxFiles = DEFAULT_MAX_FILES,
    maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
  }: ArtifactLimits = {},
): { files: number; totalBytes: number } {
  const root = resolve(artifactRoot)
  const rootStat = lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Unsafe Storybook artifact root: ${root}`)
  }

  let files = 0
  let totalBytes = 0

  function visit(path: string): void {
    const pathRelativeToRoot = relative(root, path)
    if (pathRelativeToRoot.startsWith('..') || resolve(path) === root) {
      throw new Error(`Unsafe Storybook path: ${path}`)
    }
    if (RESERVED_PAGES_PATHS.has(basename(path).toLowerCase())) {
      throw new Error(
        `Storybook artifact contains reserved Pages control path: ${pathRelativeToRoot}`,
      )
    }

    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error(`Unsafe Storybook entry: ${pathRelativeToRoot}`)
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).toSorted()) visit(join(path, entry))
      return
    }

    files += 1
    totalBytes += stat.size
    if (stat.size > maxFileBytes) {
      throw new Error(
        `Storybook entry ${pathRelativeToRoot} exceeds the ${maxFileBytes}-byte file limit`,
      )
    }
    if (files > maxFiles) throw new Error(`Storybook artifact exceeds the ${maxFiles}-file limit`)
    if (totalBytes > maxTotalBytes) {
      throw new Error(`Storybook artifact exceeds the ${maxTotalBytes}-byte site limit`)
    }
  }

  for (const entry of readdirSync(root).toSorted()) visit(join(root, entry))
  const indexPath = join(root, 'index.html')
  try {
    if (!lstatSync(indexPath).isFile()) throw new Error('not a file')
  } catch {
    throw new Error(`Storybook artifact ${root} is missing index.html`)
  }
  return { files, totalBytes }
}

export function writeStorybookTombstone(destination: string): void {
  const root = resolve(destination)
  rmSync(root, { force: true, recursive: true })
  mkdirSync(root, { recursive: true })
  writeFileSync(
    join(root, '404.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Preview unavailable</title><h1>Preview unavailable</h1><p>This Storybook preview has closed.</p></html>\n',
  )
}

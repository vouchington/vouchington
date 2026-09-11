import { statSync } from 'node:fs'
import { normalize } from 'node:path'

type FileMetadata = {
  ctimeNs: bigint
  mtimeNs: bigint
  size: bigint
}

type Probe = {
  key: string
  replay(): unknown
  value: unknown
}

export type BackendProgramProbeSnapshot = {
  probes: readonly Probe[]
  stableDuringCapture: boolean
}

export interface BackendProgramFilesystemHost {
  directoryExists?(path: string): boolean
  fileExists(path: string): boolean
  getDirectories?(path: string): string[]
  readDirectory?(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number,
  ): string[]
  readFile(path: string): string | undefined
  realpath?(path: string): string
}

export interface BackendProgramHostTrackingOptions {
  afterRead?(path: string): boolean | void
  readFileReplay?: 'always' | 'when-filesystem-metadata-stable'
}

export function trackBackendProgramCompilerHost<Host extends BackendProgramFilesystemHost>(
  host: Host,
  options?: BackendProgramHostTrackingOptions,
): { host: Host; snapshot(): BackendProgramProbeSnapshot } {
  const probes = new Map<string, Probe>()
  let stableDuringCapture = true

  const record = (key: string, value: unknown, replay: () => unknown): unknown => {
    const existing = probes.get(key)
    if (existing && !sameValue(existing.value, value)) stableDuringCapture = false
    else if (!existing) probes.set(key, { key, replay, value })
    return value
  }
  const wrapBoolean = (
    operation: string,
    original: ((path: string) => boolean) | undefined,
  ): ((path: string) => boolean) | undefined =>
    original &&
    (path => {
      const key = `${operation}:${normalizedPath(path)}`
      return record(key, original.call(host, path), () => original.call(host, path)) as boolean
    })
  const capturePaths = (key: string, originalPaths: string[], replay: () => string[]): string[] => {
    record(key, normalizedPaths(originalPaths), () => normalizedPaths(replay()))
    return originalPaths
  }
  const wrapPaths = (
    operation: string,
    original: ((path: string) => string[]) | undefined,
  ): ((path: string) => string[]) | undefined =>
    original &&
    (path =>
      capturePaths(`${operation}:${normalizedPath(path)}`, original.call(host, path), () =>
        original.call(host, path),
      ))

  const readFile = host.readFile
  host.readFile = path => {
    const key = `readFile:${normalizedPath(path)}`
    const usesMetadataReplay = options?.readFileReplay === 'when-filesystem-metadata-stable'
    const before = usesMetadataReplay ? fileMetadata(path) : undefined
    const value = readFile.call(host, path)
    if (options?.afterRead?.(path)) stableDuringCapture = false
    const after = usesMetadataReplay ? fileMetadata(path) : undefined
    if (usesMetadataReplay && !sameMetadata(before, after)) stableDuringCapture = false
    return record(key, value, () => {
      const current = usesMetadataReplay ? fileMetadata(path) : undefined
      return usesMetadataReplay &&
        value !== undefined &&
        after !== undefined &&
        sameMetadata(after, current)
        ? value
        : readFile.call(host, path)
    }) as string | undefined
  }
  host.fileExists = wrapBoolean('fileExists', host.fileExists)!
  host.directoryExists = wrapBoolean('directoryExists', host.directoryExists)
  host.getDirectories = wrapPaths('getDirectories', host.getDirectories)
  const readDirectory = host.readDirectory
  if (readDirectory) {
    host.readDirectory = (path, extensions, exclude, include, depth) => {
      const argumentsKey = JSON.stringify([extensions, exclude, include, depth])
      const key = `readDirectory:${normalizedPath(path)}:${argumentsKey}`
      return capturePaths(
        key,
        readDirectory.call(host, path, extensions, exclude, include, depth),
        () => readDirectory.call(host, path, extensions, exclude, include, depth),
      )
    }
  }
  const realpath = host.realpath
  if (realpath) {
    host.realpath = path => {
      const key = `realpath:${normalizedPath(path)}`
      const read = () => normalizedPath(realpath.call(host, path))
      return record(key, read(), read) as string
    }
  }

  return {
    host,
    snapshot: () => ({
      probes: [...probes.values()].toSorted((left, right) => left.key.localeCompare(right.key)),
      stableDuringCapture,
    }),
  }
}

export function backendProgramProbesAreFresh(snapshot: BackendProgramProbeSnapshot): boolean {
  return (
    snapshot.stableDuringCapture &&
    snapshot.probes.every(probe => {
      try {
        return sameValue(probe.value, probe.replay())
      } catch (error) {
        if (isMissingFilesystemInput(error)) return false
        throw error
      }
    })
  )
}

function fileMetadata(path: string): FileMetadata | undefined {
  try {
    const stat = statSync(path, { bigint: true })
    return { ctimeNs: stat.ctimeNs, mtimeNs: stat.mtimeNs, size: stat.size }
  } catch (error) {
    if (isMissingFilesystemInput(error)) return undefined
    throw error
  }
}

function normalizedPath(path: string): string {
  return normalize(path).replaceAll('\\', '/')
}

function normalizedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(normalizedPath))].toSorted()
}

function sameMetadata(left: FileMetadata | undefined, right: FileMetadata | undefined): boolean {
  return (
    left?.ctimeNs === right?.ctimeNs &&
    left?.mtimeNs === right?.mtimeNs &&
    left?.size === right?.size
  )
}

function sameValue(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right
}

function isMissingFilesystemInput(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

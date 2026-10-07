import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// A static import pulls this plain script into the typecheck program, which then
// tries to emit over the .mjs. Load it by URL so image Node 22 can still run it.
const {
  checksumLine,
  distFileTag,
  ensureNvmrcNode,
  findCachedNodeBinDir,
  githubPathLine,
  nodeSatisfiesSpec,
  selectRelease,
  tarballName,
} = (await import(new URL('./require-nvmrc-node.mjs', import.meta.url).href)) as {
  checksumLine: (shasums: string, fileName: string) => string | null
  distFileTag: (platform: string, arch: string) => string
  ensureNvmrcNode: (options: {
    spec: string
    actualVersion: string
    arch: string
    platform: string
    toolCache: string
    fetchImpl: (url: string) => Promise<{
      ok: boolean
      json?: () => Promise<unknown>
      text?: () => Promise<string>
      arrayBuffer?: () => Promise<ArrayBuffer>
    }>
    appendPath: (binDir: string) => void
    log?: (message: string) => void
    installTarball?: (bytes: Buffer, dest: string) => void
  }) => Promise<{ action: string; version: string; binDir?: string }>
  findCachedNodeBinDir: (
    toolCache: string,
    spec: string,
    arch: string,
  ) => { version: string; binDir: string } | null
  githubPathLine: (existing: string, binDir: string) => string
  nodeSatisfiesSpec: (actualVersion: string, spec: string) => boolean
  selectRelease: (
    index: Array<{ version?: string; files?: string[] }>,
    spec: string,
    fileTag: string,
  ) => string | null
  tarballName: (version: string, platform: string, arch: string) => string
}

const directories = []

function tempDir() {
  const directory = mkdtempSync(join(tmpdir(), 'nvmrc-node-test-'))
  directories.push(directory)
  return directory
}

describe('require-nvmrc-node', () => {
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true })
  })

  it('matches a major, minor, or exact .nvmrc spec', () => {
    expect(nodeSatisfiesSpec('22.23.3', '26')).toBe(false)
    expect(nodeSatisfiesSpec('26.10.0', '26')).toBe(true)
    expect(nodeSatisfiesSpec('v27.0.0', '26')).toBe(false)
    expect(nodeSatisfiesSpec('26.10.1', '26.10')).toBe(true)
    expect(nodeSatisfiesSpec('26.11.0', '26.10')).toBe(false)
    expect(nodeSatisfiesSpec('26.10.0', '26.10.0')).toBe(true)
    expect(nodeSatisfiesSpec('26.10.1', '26.10.0')).toBe(false)
  })

  it('selects the newest cached Node for this architecture', () => {
    const toolCache = tempDir()
    const bin = version => join(toolCache, 'node', version, 'x64', 'bin')
    mkdirSync(bin('26.9.0'), { recursive: true })
    writeFileSync(join(bin('26.9.0'), 'node'), '')
    mkdirSync(bin('26.10.0'), { recursive: true })
    writeFileSync(join(bin('26.10.0'), 'node'), '')
    mkdirSync(join(toolCache, 'node', '26.11.0', 'arm64', 'bin'), { recursive: true })
    writeFileSync(join(toolCache, 'node', '26.11.0', 'arm64', 'bin', 'node'), '')
    mkdirSync(join(toolCache, 'node', '22.23.3', 'x64', 'bin'), { recursive: true })
    writeFileSync(join(toolCache, 'node', '22.23.3', 'x64', 'bin', 'node'), '')

    expect(findCachedNodeBinDir(toolCache, '26', 'x64')).toEqual({
      version: '26.10.0',
      binDir: bin('26.10.0'),
    })
    expect(findCachedNodeBinDir(toolCache, '24', 'x64')).toBeNull()
  })

  it('leaves PATH alone when Node already matches .nvmrc', async () => {
    const paths = []
    const result = await ensureNvmrcNode({
      spec: '26\n',
      actualVersion: '26.10.0',
      arch: 'x64',
      platform: 'linux',
      toolCache: tempDir(),
      fetchImpl: () => {
        throw new Error('fetch')
      },
      appendPath: binDir => paths.push(binDir),
      log: () => {},
    })
    expect(result).toEqual({ action: 'already-active', version: '26.10.0' })
    expect(paths).toEqual([])
  })

  it('prepends a cached Node when setup-node left Node 22 on PATH', async () => {
    const toolCache = tempDir()
    const binDir = join(toolCache, 'node', '26.10.0', 'x64', 'bin')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(binDir, 'node'), '')
    const paths = []
    const logs = []
    const result = await ensureNvmrcNode({
      spec: '26',
      actualVersion: '22.23.3',
      arch: 'x64',
      platform: 'linux',
      toolCache,
      fetchImpl: () => {
        throw new Error('fetch')
      },
      appendPath: binDirPath => paths.push(binDirPath),
      log: message => logs.push(message),
    })
    expect(result.action).toBe('tool-cache')
    expect(paths).toEqual([binDir])
    expect(logs[0]).toBe('Node on PATH is 22.23.3; .nvmrc requires 26.')
  })

  it('installs the newest matching nodejs.org release when the tool cache misses', async () => {
    const bytes = Buffer.from('node-tarball')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const name = tarballName('26.10.0', 'linux', 'x64')
    const urls = []
    const toolCache = tempDir()
    const paths = []
    const result = await ensureNvmrcNode({
      spec: '26',
      actualVersion: '22.23.3',
      arch: 'x64',
      platform: 'linux',
      toolCache,
      log: () => {},
      appendPath: binDir => paths.push(binDir),
      fetchImpl: url => {
        urls.push(url)
        if (url.endsWith('/index.json')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { version: 'v26.9.0', files: ['linux-x64'] },
                { version: 'v22.23.3', files: ['linux-x64'] },
                { version: 'v26.10.0', files: ['linux-x64', 'osx-arm64-tar'] },
              ]),
          })
        }
        if (url.endsWith('/SHASUMS256.txt')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(`${hash}  ${name}\n`) })
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            ),
        })
      },
      installTarball: (_bytes, dest) => {
        mkdirSync(join(dest, 'bin'), { recursive: true })
        writeFileSync(join(dest, 'bin', 'node'), '')
      },
    })
    expect(distFileTag('linux', 'x64')).toBe('linux-x64')
    expect(selectRelease([{ version: 'v26.10.0', files: ['linux-x64'] }], '26', 'linux-x64')).toBe(
      '26.10.0',
    )
    expect(urls).toEqual([
      'https://nodejs.org/dist/index.json',
      'https://nodejs.org/dist/v26.10.0/SHASUMS256.txt',
      `https://nodejs.org/dist/v26.10.0/${name}`,
    ])
    expect(result).toEqual({
      action: 'installed',
      version: '26.10.0',
      binDir: join(toolCache, 'node', '26.10.0', 'x64', 'bin'),
    })
    expect(paths).toEqual([result.binDir])
  })

  it('rejects a tarball whose checksum does not match', async () => {
    await expect(
      ensureNvmrcNode({
        spec: '26',
        actualVersion: '22.23.3',
        arch: 'x64',
        platform: 'linux',
        toolCache: tempDir(),
        log: () => {},
        appendPath: () => {
          throw new Error('path')
        },
        fetchImpl: url => {
          if (url.endsWith('/index.json')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve([{ version: 'v26.10.0', files: ['linux-x64'] }]),
            })
          }
          if (url.endsWith('/SHASUMS256.txt')) {
            return Promise.resolve({
              ok: true,
              text: () =>
                Promise.resolve(`${'a'.repeat(64)}  ${tarballName('26.10.0', 'linux', 'x64')}\n`),
            })
          }
          const bytes = Buffer.from('tampered')
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
              ),
          })
        },
      }),
    ).rejects.toThrow('Checksum mismatch')
  })

  it('formats a GITHUB_PATH entry without gluing it to the previous line', () => {
    expect(githubPathLine('', '/opt/node/bin')).toBe('/opt/node/bin\n')
    expect(githubPathLine('/usr/bin\n', '/opt/node/bin')).toBe('/opt/node/bin\n')
    expect(githubPathLine('/usr/bin', '/opt/node/bin')).toBe('\n/opt/node/bin\n')
    const hash = 'b'.repeat(64)
    expect(checksumLine(`abc  other\n${hash}  node.tar.gz\n`, 'node.tar.gz')).toBe(hash)
  })
})

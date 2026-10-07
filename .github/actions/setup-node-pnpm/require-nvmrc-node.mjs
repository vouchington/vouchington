import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// actions/setup-node can exit 0 after "Attempting to download <spec>..." without
// adding Node to PATH. pnpm/action-setup then freezes that image Node into its shims.

function stripV(value) {
  return value.startsWith('v') ? value.slice(1) : value
}

function parseRelease(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(stripV(value))
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function parseSpec(spec) {
  const wanted = stripV(spec.trim())
  if (/^\d+$/.test(wanted)) return [Number(wanted)]
  if (/^\d+\.\d+$/.test(wanted)) return wanted.split('.').map(Number)
  return parseRelease(wanted)
}

export function nodeSatisfiesSpec(actualVersion, spec) {
  const actual = parseRelease(actualVersion)
  const wanted = parseSpec(spec)
  if (!actual || !wanted || wanted.length > actual.length) return false
  for (let index = 0; index < wanted.length; index += 1) {
    if (actual[index] !== wanted[index]) return false
  }
  return true
}

function compareReleaseDesc(left, right) {
  const a = parseRelease(left)
  const b = parseRelease(right)
  if (!a || !b) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index]
  }
  return 0
}

export function findCachedNodeBinDir(toolCache, spec, arch) {
  const root = join(toolCache, 'node')
  if (!existsSync(root)) return null
  const versions = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && nodeSatisfiesSpec(entry.name, spec)) versions.push(entry.name)
  }
  for (const version of versions.toSorted(compareReleaseDesc)) {
    const binDir = join(root, version, arch, 'bin')
    if (existsSync(join(binDir, 'node'))) return { version, binDir }
  }
  return null
}

export function distFileTag(platform, arch) {
  if (platform === 'linux') return `linux-${arch}`
  if (platform === 'darwin') return `osx-${arch}-tar`
  throw new Error(`Cannot install Node for ${platform} ${arch}`)
}

export function tarballName(version, platform, arch) {
  if (platform !== 'linux' && platform !== 'darwin') {
    throw new Error(`Cannot install Node for ${platform} ${arch}`)
  }
  const osName = platform === 'darwin' ? 'darwin' : platform
  return `node-v${version}-${osName}-${arch}.tar.gz`
}

export function selectRelease(index, spec, fileTag) {
  const matches = []
  for (const release of index) {
    if (!release || typeof release.version !== 'string' || !Array.isArray(release.files)) continue
    if (!release.files.includes(fileTag)) continue
    const version = stripV(release.version)
    if (!nodeSatisfiesSpec(version, spec)) continue
    matches.push(version)
  }
  return matches.toSorted(compareReleaseDesc)[0] ?? null
}

export function checksumLine(shasums, fileName) {
  for (const line of shasums.split('\n')) {
    const match = /^([a-f0-9]{64})\s+\*?(\S+)\s*$/.exec(line)
    if (match?.[2] === fileName) return match[1]
  }
  return null
}

export function githubPathLine(existing, binDir) {
  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
  return `${prefix}${binDir}\n`
}

async function fetchOk(fetchImpl, url) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
  return response
}

function defaultInstallTarball(bytes, dest) {
  const scratch = mkdtempSync(join(tmpdir(), 'nvmrc-node-'))
  const archive = join(scratch, 'node.tar.gz')
  try {
    writeFileSync(archive, bytes)
    mkdirSync(dest, { recursive: true })
    execFileSync('tar', ['-xzf', archive, '-C', dest, '--strip-components=1'], {
      stdio: 'pipe',
    })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export async function ensureNvmrcNode(options) {
  const log = options.log ?? console.log
  const spec = options.spec.trim()
  if (nodeSatisfiesSpec(options.actualVersion, spec)) {
    log(`Node ${options.actualVersion} matches .nvmrc ${spec}.`)
    return { action: 'already-active', version: stripV(options.actualVersion) }
  }

  log(`Node on PATH is ${options.actualVersion}; .nvmrc requires ${spec}.`)
  const cached = findCachedNodeBinDir(options.toolCache, spec, options.arch)
  if (cached) {
    options.appendPath(cached.binDir)
    log(`Using tool cache Node ${cached.version} at ${cached.binDir}.`)
    return { action: 'tool-cache', version: cached.version, binDir: cached.binDir }
  }

  const fileTag = distFileTag(options.platform, options.arch)
  const index = await (
    await fetchOk(options.fetchImpl, 'https://nodejs.org/dist/index.json')
  ).json()
  const version = selectRelease(index, spec, fileTag)
  if (!version) throw new Error(`No Node ${spec} release publishes ${fileTag}`)

  const name = tarballName(version, options.platform, options.arch)
  const base = `https://nodejs.org/dist/v${version}`
  const shasums = await (await fetchOk(options.fetchImpl, `${base}/SHASUMS256.txt`)).text()
  const expected = checksumLine(shasums, name)
  if (!expected) throw new Error(`SHASUMS256.txt has no entry for ${name}`)
  const bytes = Buffer.from(
    await (await fetchOk(options.fetchImpl, `${base}/${name}`)).arrayBuffer(),
  )
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== expected) throw new Error(`Checksum mismatch for ${name}`)

  const dest = join(options.toolCache, 'node', version, options.arch)
  ;(options.installTarball ?? defaultInstallTarball)(bytes, dest)
  const binDir = join(dest, 'bin')
  if (!existsSync(join(binDir, 'node'))) {
    throw new Error(`Node ${version} tarball did not contain bin/node`)
  }
  options.appendPath(binDir)
  log(`Installed Node ${version} from ${base}/${name}.`)
  return { action: 'installed', version, binDir }
}

function appendGithubPath(file, binDir) {
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  appendFileSync(file, githubPathLine(existing, binDir))
}

async function main() {
  const spec = readFileSync('.nvmrc', 'utf8')
  const toolCache = process.env.RUNNER_TOOL_CACHE
  const githubPath = process.env.GITHUB_PATH
  if (!toolCache || !githubPath) {
    throw new Error('RUNNER_TOOL_CACHE and GITHUB_PATH are required')
  }
  await ensureNvmrcNode({
    spec,
    actualVersion: process.versions.node,
    arch: process.arch,
    platform: process.platform,
    toolCache,
    fetchImpl: fetch,
    appendPath: binDir => appendGithubPath(githubPath, binDir),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { fetch } from 'undici'

const execFileAsync = promisify(execFile)

export const FAKE_GCS_SERVER_PACKAGE = {
  version: '1.56.1',
  sha256: {
    'Darwin/amd64': 'bbcbb78e57c4a7ad242bc971b70a57f963c8daa616ae649254562fbd7f2bc54d',
    'Darwin/arm64': '039d7a520869115b9bc1b354f73612d2dad0aa27b22104f111d8c94985007fe1',
    'Linux/amd64': '0f2f9f6884417acd5cc27126a9aa237ccc627372a4aa5008b399641de6db9469',
    'Linux/arm64': '89a4b887a50834ce5844f47f9938a1203a89330e660b2af7851b858fa489fa96',
  },
} as const

const DOWNLOAD_DEADLINE_MS = 180_000
type PackagePlatform = keyof typeof FAKE_GCS_SERVER_PACKAGE.sha256

const repoRoot = resolve(import.meta.dirname, '..', '..')

export function fakeGcsServerCacheDir(): string {
  return join(repoRoot, '.cache', 'fake-gcs-server', FAKE_GCS_SERVER_PACKAGE.version)
}

export function fakeGcsServerPlatform(): PackagePlatform {
  const hostPlatform = platform()
  const os = hostPlatform === 'darwin' ? 'Darwin' : hostPlatform === 'linux' ? 'Linux' : undefined
  const cpu = arch() === 'x64' ? 'amd64' : arch() === 'arm64' ? 'arm64' : undefined
  if (!os || !cpu) {
    throw new Error(
      `fake-gcs-server ${FAKE_GCS_SERVER_PACKAGE.version} has no ${hostPlatform}/${arch()} asset`,
    )
  }
  return `${os}/${cpu}` as PackagePlatform
}

/** Downloads, verifies and extracts the pinned release binary once per checkout and platform. */
export async function ensureFakeGcsServerBinary(
  target: PackagePlatform = fakeGcsServerPlatform(),
): Promise<string> {
  const [os, cpu] = target.split('/') as ['Darwin' | 'Linux', 'amd64' | 'arm64']
  const dir = join(fakeGcsServerCacheDir(), `${os}-${cpu}`)
  const binary = join(dir, 'fake-gcs-server')
  if (existsSync(binary)) return binary

  await mkdir(dir, { recursive: true })
  const staging = await mkdtemp(join(dir, 'staging-'))
  try {
    const asset = `fake-gcs-server_${FAKE_GCS_SERVER_PACKAGE.version}_${os}_${cpu}.tar.gz`
    const archive = join(staging, asset)
    const url = `https://github.com/fsouza/fake-gcs-server/releases/download/v${FAKE_GCS_SERVER_PACKAGE.version}/${asset}`
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_DEADLINE_MS) })
    if (!response.ok || !response.body) {
      throw new Error(`fake-gcs-server download failed: ${response.status} ${url}`)
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))

    const digest = await sha256File(archive)
    const expected = FAKE_GCS_SERVER_PACKAGE.sha256[target]
    if (digest !== expected) {
      throw new Error(`fake-gcs-server archive digest ${digest} does not match pinned ${expected}`)
    }

    await execFileAsync('tar', ['-xzf', archive, '-C', staging, 'fake-gcs-server'], {
      timeout: DOWNLOAD_DEADLINE_MS,
    })
    const extracted = join(staging, 'fake-gcs-server')
    await chmod(extracted, 0o755)
    await rename(extracted, binary)
    return binary
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { arch } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { fetch } from 'undici'
import { createAwsEmulatorDownloadDispatcher } from './aws-emulator-dispatchers.mts'

const execFileAsync = promisify(execFile)

/**
 * The AWS Emulator package every test run uses. AWS publishes versioned packages under
 * `LTS/` (listed in `LTS/versions.json`) and signs each with the SSM Publishing key
 * (fingerprint 98BC F336 A3BE 53B7 34E9 67C5 2E5B F49B D940 F624). A version bump verifies the
 * new `.deb.sig` files with that key, then records each package's SHA-256 here; the test harness
 * only checks the recorded digest.
 */
export const AWS_EMULATOR_PACKAGE = {
  version: '1.0.322',
  sha256: {
    amd64: 'ef3c75e5d4196bf2c0170b55b75b01e340e0ef497e636b700a1efe68d68a60d7',
    arm64: '8cfabb461ccfbfa75468393e8dfbf5216b07ef54fcf20584c11d02a9fc854b03',
  },
} as const

const DOWNLOAD_DEADLINE_MS = 180_000

export type DebArch = keyof typeof AWS_EMULATOR_PACKAGE.sha256

const repoRoot = resolve(import.meta.dirname, '..', '..')

export function awsEmulatorCacheDir(): string {
  return join(repoRoot, '.cache', 'aws-emulator', AWS_EMULATOR_PACKAGE.version)
}

export function debArch(): DebArch {
  const value = arch()
  if (value === 'x64') return 'amd64'
  if (value === 'arm64') return 'arm64'
  throw new Error(`The AWS Emulator ships no Linux package for ${value}`)
}

/** Downloads, verifies and extracts the pinned binary once per checkout and architecture. */
export async function ensureAwsEmulatorBinary(target: DebArch = debArch()): Promise<string> {
  const dir = join(awsEmulatorCacheDir(), target)
  const binary = join(dir, 'aws-emulator')
  if (existsSync(binary)) return binary

  await mkdir(dir, { recursive: true })
  const staging = await mkdtemp(join(dir, 'staging-'))
  try {
    const deb = join(staging, 'aws-emulator.deb')
    const url = `https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/aws-emulator_${AWS_EMULATOR_PACKAGE.version}-1_${target}.deb`
    const dispatcher = createAwsEmulatorDownloadDispatcher()
    try {
      const response = await fetch(url, {
        dispatcher,
        signal: AbortSignal.timeout(DOWNLOAD_DEADLINE_MS),
      })
      if (!response.ok || !response.body) {
        throw new Error(`AWS Emulator download failed: ${response.status} ${url}`)
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(deb))
    } finally {
      await dispatcher.close()
    }

    const digest = await sha256File(deb)
    const expected = AWS_EMULATOR_PACKAGE.sha256[target]
    if (digest !== expected) {
      throw new Error(`AWS Emulator package digest ${digest} does not match pinned ${expected}`)
    }

    // A .deb is an ar archive; the binary is the only file we need from its data tarball.
    await execFileAsync(
      'sh',
      [
        '-c',
        'ar p "$0" data.tar.xz | tar -xJf - -C "$1" ./opt/aws-emulator/bin/aws-emulator',
        deb,
        staging,
      ],
      { timeout: DOWNLOAD_DEADLINE_MS },
    )
    const extracted = join(staging, 'opt', 'aws-emulator', 'bin', 'aws-emulator')
    await chmod(extracted, 0o755)
    // Concurrent runs may race to this point; rename is atomic and either copy is identical.
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

import { resolve } from 'node:path'
import undici from 'undici'
import { startAwsEmulator, type RunningAwsEmulator } from '@vouchington/aws/testing'
import { startWithStalledDownloadRetry } from './aws-emulator-download-attempts.mts'

/**
 * The AWS Emulator package every test run uses. AWS publishes versioned packages under
 * `LTS/` (listed in `LTS/versions.json`) and signs each with the SSM Publishing key
 * (fingerprint 98BC F336 A3BE 53B7 34E9 67C5 2E5B F49B D940 F624). A version bump verifies the
 * new `.deb.sig` files with that key, then records each package's SHA-256 here; the test harness
 * only checks the recorded digest.
 */
const AWS_EMULATOR_PACKAGE_PIN = {
  version: '1.0.322',
  sha256: {
    amd64: 'ef3c75e5d4196bf2c0170b55b75b01e340e0ef497e636b700a1efe68d68a60d7',
    arm64: '8cfabb461ccfbfa75468393e8dfbf5216b07ef54fcf20584c11d02a9fc854b03',
  },
} as const

// macOS cannot run the Linux binary, so it runs inside the mirrored Debian Node image.
const LINUX_RUNTIME_IMAGE =
  'ghcr.io/vouchington/dependency-node:26-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec'

const cacheDir = resolve(import.meta.dirname, '..', '..', '.cache', 'aws-emulator')

/**
 * Starts the pinned emulator; the package download honors HTTPS_PROXY where a sandbox needs one.
 * A download that stalls is cancelled and started again, see `startWithStalledDownloadRetry`.
 */
export function startVouchaAwsEmulator(): Promise<RunningAwsEmulator> {
  return startWithStalledDownloadRetry(async attemptSignal => {
    const dispatcher = new undici.EnvHttpProxyAgent()
    try {
      return await startAwsEmulator({
        package: {
          pin: AWS_EMULATOR_PACKAGE_PIN,
          cacheDir,
          fetch: (url, init) =>
            undici.fetch(url, {
              dispatcher,
              signal: AbortSignal.any([init.signal, attemptSignal]),
            }) as unknown as Promise<Response>,
        },
        dockerImage: LINUX_RUNTIME_IMAGE,
        namePrefix: 'voucha-aws-emulator',
      })
    } finally {
      await dispatcher.close()
    }
  })
}

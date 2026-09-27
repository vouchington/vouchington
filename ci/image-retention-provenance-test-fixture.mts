import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { onTestFinished } from 'vitest'

export async function queueVerifier(fail = false): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'image-retention-gh-'))
  onTestFinished(() => rm(directory, { force: true, recursive: true }))
  const executable = join(directory, 'gh')
  await writeFile(
    executable,
    `#!${process.execPath}
const args = process.argv.slice(2)
if (${JSON.stringify(fail)}) process.exit(9)
const image = args[2].slice('oci://ghcr.io/vouchington/'.length).split('@')
const target = image[0], digest = image[1], source = args[args.indexOf('--source-digest') + 1]
const ref = 'refs/heads/gh-readonly-queue/main/pr-1-synthetic'
const publisher = target === 'web' ? 'publish-web-images.yml' : 'publish-backend-images.yml'
process.stdout.write(JSON.stringify([{ verificationResult: {
  signature: { certificate: {
    sourceRepositoryURI: 'https://github.com/vouchington/vouchington',
    sourceRepositoryOwnerURI: 'https://github.com/vouchington', sourceRepositoryDigest: source,
    buildSignerDigest: source, sourceRepositoryRef: ref,
    issuer: 'https://token.actions.githubusercontent.com', runnerEnvironment: 'github-hosted',
    subjectAlternativeName: 'https://github.com/vouchington/vouchington/.github/workflows/' + publisher + '@' + ref,
  } },
  statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [
    { name: 'ghcr.io/vouchington/' + target, digest: { sha256: digest.slice(7) } },
  ] },
} }]))
`,
  )
  await chmod(executable, 0o700)
  return executable
}

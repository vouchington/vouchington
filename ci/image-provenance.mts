const SHA = /^[0-9a-f]{40}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const ISSUER = 'https://token.actions.githubusercontent.com'
const REPOSITORY = 'vouchington/vouchington'

export type ImageProvenanceRequest = {
  digest: string
  sourceDigest: string
  target: 'api' | 'worker-cpu' | 'worker-io' | 'web'
  mode: 'main-reuse' | 'queue-retention'
}

const publisherFor = (target: ImageProvenanceRequest['target']) =>
  target === 'web' ? 'publish-web-images.yml' : 'publish-backend-images.yml'

function sourceRefAllowed(ref: string, mode: ImageProvenanceRequest['mode']): boolean {
  if (ref === 'refs/heads/main') return mode === 'main-reuse'
  return /^refs\/heads\/gh-readonly-queue\/main\/[^\s@]+$/u.test(ref)
}

function validateRequest(request: ImageProvenanceRequest): void {
  if (
    !DIGEST.test(request.digest) ||
    !SHA.test(request.sourceDigest) ||
    !['api', 'worker-cpu', 'worker-io', 'web'].includes(request.target) ||
    !['main-reuse', 'queue-retention'].includes(request.mode)
  )
    throw new Error('invalid immutable image provenance request')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function buildImageAttestationVerifyArgs(request: ImageProvenanceRequest): string[] {
  validateRequest(request)
  const publisher = publisherFor(request.target)
  const refPattern =
    request.mode === 'main-reuse'
      ? '(?:refs/heads/main|refs/heads/gh-readonly-queue/main/[^\\s@]+)'
      : 'refs/heads/gh-readonly-queue/main/[^\\s@]+'
  return [
    'attestation',
    'verify',
    `oci://ghcr.io/vouchington/${request.target}@${request.digest}`,
    '--bundle-from-oci',
    '--repo',
    REPOSITORY,
    '--source-digest',
    request.sourceDigest,
    '--signer-digest',
    request.sourceDigest,
    '--deny-self-hosted-runners',
    '--cert-identity-regex',
    `^${escapeRegex(`https://github.com/${REPOSITORY}/.github/workflows/${publisher}`)}@${refPattern}$`,
    '--format',
    'json',
  ]
}

type Json = Record<string, unknown>
const record = (value: unknown): Json | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined
const string = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export type TrustedImageProvenance = { sourceRef: string; sourceDigest: string; digest: string }

export function parseTrustedImageProvenance(
  value: unknown,
  request: ImageProvenanceRequest,
): TrustedImageProvenance[] {
  validateRequest(request)
  if (!Array.isArray(value) || value.length === 0) throw new Error('verification results are empty')
  const publisherUri = `https://github.com/${REPOSITORY}/.github/workflows/${publisherFor(request.target)}`
  return value.map(entry => {
    const result = record(record(entry)?.['verificationResult'])
    const certificate = record(record(result?.['signature'])?.['certificate'])
    const statement = record(result?.['statement'])
    const subjects = statement?.['subject']
    if (
      !certificate ||
      !Array.isArray(subjects) ||
      statement?.['predicateType'] !== 'https://slsa.dev/provenance/v1'
    )
      throw new Error('malformed verified attestation')
    const ref = string(certificate['sourceRepositoryRef'])
    if (
      certificate['sourceRepositoryURI'] !== `https://github.com/${REPOSITORY}` ||
      certificate['sourceRepositoryOwnerURI'] !== 'https://github.com/vouchington' ||
      certificate['sourceRepositoryDigest'] !== request.sourceDigest ||
      certificate['buildSignerDigest'] !== request.sourceDigest ||
      certificate['issuer'] !== ISSUER ||
      certificate['runnerEnvironment'] !== 'github-hosted' ||
      !ref ||
      !sourceRefAllowed(ref, request.mode) ||
      certificate['subjectAlternativeName'] !== `${publisherUri}@${ref}` ||
      subjects.length !== 1 ||
      !subjects.every(subject => {
        const item = record(subject)
        const digest = record(item?.['digest'])
        return (
          item?.['name'] === `ghcr.io/vouchington/${request.target}` &&
          digest !== undefined &&
          Object.keys(digest).length === 1 &&
          digest['sha256'] === request.digest.slice(7)
        )
      })
    )
      throw new Error('verified attestation violates image provenance policy')
    return { sourceRef: ref, sourceDigest: request.sourceDigest, digest: request.digest }
  })
}

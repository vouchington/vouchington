import { describe, expect, it } from 'vitest'
import {
  buildImageAttestationVerifyArgs,
  parseTrustedImageProvenance,
} from './image-provenance.mts'

const sha = 'a'.repeat(40)
const digest = `sha256:${'b'.repeat(64)}`
const request = { digest, sourceDigest: sha, target: 'api' as const, mode: 'main-reuse' as const }
const result = (overrides: Record<string, unknown> = {}) => [
  {
    verificationResult: {
      signature: {
        certificate: {
          sourceRepositoryURI: 'https://github.com/vouchington/vouchington',
          sourceRepositoryOwnerURI: 'https://github.com/vouchington',
          sourceRepositoryDigest: sha,
          sourceRepositoryRef: 'refs/heads/main',
          buildSignerDigest: sha,
          issuer: 'https://token.actions.githubusercontent.com',
          runnerEnvironment: 'github-hosted',
          subjectAlternativeName:
            'https://github.com/vouchington/vouchington/.github/workflows/publish-backend-images.yml@refs/heads/main',
          ...overrides,
        },
      },
      statement: {
        predicateType: 'https://slsa.dev/provenance/v1',
        subject: [{ name: 'ghcr.io/vouchington/api', digest: { sha256: digest.slice(7) } }],
      },
    },
  },
]

describe('image provenance', () => {
  it('builds one bounded OCI verifier invocation', () => {
    expect(buildImageAttestationVerifyArgs(request)).toEqual(
      expect.arrayContaining([
        'attestation',
        'verify',
        `oci://ghcr.io/vouchington/api@${digest}`,
        '--bundle-from-oci',
        '--repo',
        'vouchington/vouchington',
        '--source-digest',
        sha,
        '--signer-digest',
        sha,
        '--deny-self-hosted-runners',
        '--format',
        'json',
      ]),
    )
  })
  it('returns only trusted facts', () =>
    expect(parseTrustedImageProvenance(result(), request)).toEqual([
      { sourceRef: 'refs/heads/main', sourceDigest: sha, digest },
    ]))
  it.each([
    { sourceRepositoryRef: 'refs/heads/gh-readonly-queue/main/x@evil' },
    { subjectAlternativeName: 'x' },
    { runnerEnvironment: 'self-hosted' },
  ])('fails closed for invalid certificate data', overrides =>
    expect(() => parseTrustedImageProvenance(result(overrides), request)).toThrow(Error),
  )
  it.each([
    'sourceRepositoryURI',
    'sourceRepositoryOwnerURI',
    'sourceRepositoryDigest',
    'buildSignerDigest',
    'issuer',
    'runnerEnvironment',
    'subjectAlternativeName',
  ])('rejects a mutated signed %s', field => {
    expect(() => parseTrustedImageProvenance(result({ [field]: 'untrusted' }), request)).toThrow(
      Error,
    )
  })
  it.each(['', 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(64), 'A'.repeat(40)])(
    'rejects invalid Git SHA %s',
    sourceDigest => {
      expect(() => buildImageAttestationVerifyArgs({ ...request, sourceDigest })).toThrow(Error)
      expect(() => parseTrustedImageProvenance(result(), { ...request, sourceDigest })).toThrow(
        Error,
      )
    },
  )
  it.each(['api', 'worker-cpu', 'worker-io', 'web'] as const)(
    'binds full argv to %s in both modes',
    target => {
      for (const mode of ['main-reuse', 'queue-retention'] as const) {
        const publisher =
          target === 'web' ? 'publish-web-images\\.yml' : 'publish-backend-images\\.yml'
        const refs =
          mode === 'main-reuse'
            ? '(?:refs/heads/main|refs/heads/gh-readonly-queue/main/[^\\s@]+)'
            : 'refs/heads/gh-readonly-queue/main/[^\\s@]+'
        expect(buildImageAttestationVerifyArgs({ ...request, target, mode })).toEqual([
          'attestation',
          'verify',
          `oci://ghcr.io/vouchington/${target}@${digest}`,
          '--bundle-from-oci',
          '--repo',
          'vouchington/vouchington',
          '--source-digest',
          sha,
          '--signer-digest',
          sha,
          '--deny-self-hosted-runners',
          '--cert-identity-regex',
          `^https://github\\.com/vouchington/vouchington/\\.github/workflows/${publisher}@${refs}$`,
          '--format',
          'json',
        ])
      }
    },
  )
  it.each([
    'refs/heads/main/evil',
    'refs/heads/gh-readonly-queue/main/',
    'refs/heads/gh-readonly-queue/main/x@evil',
    'refs/heads/gh-readonly-queue/main/x\n',
    'refs/heads/gh-readonly-queue/mainish/x',
  ])('rejects source ref injection %s', sourceRepositoryRef => {
    const subjectAlternativeName = `https://github.com/vouchington/vouchington/.github/workflows/publish-backend-images.yml@${sourceRepositoryRef}`
    expect(() =>
      parseTrustedImageProvenance(result({ sourceRepositoryRef, subjectAlternativeName }), request),
    ).toThrow(Error)
  })
  it('accepts queue suffixes and confines retention to queues', () => {
    const sourceRepositoryRef = 'refs/heads/gh-readonly-queue/main/arbitrary/nested'
    const subjectAlternativeName = `https://github.com/vouchington/vouchington/.github/workflows/publish-backend-images.yml@${sourceRepositoryRef}`
    expect(
      parseTrustedImageProvenance(result({ sourceRepositoryRef, subjectAlternativeName }), request),
    ).toHaveLength(1)
    expect(
      parseTrustedImageProvenance(result({ sourceRepositoryRef, subjectAlternativeName }), {
        ...request,
        mode: 'queue-retention',
      }),
    ).toHaveLength(1)
    expect(() =>
      parseTrustedImageProvenance(result(), { ...request, mode: 'queue-retention' }),
    ).toThrow(Error)
    expect(() => parseTrustedImageProvenance(result({ sourceRepositoryRef }), request)).toThrow(
      Error,
    )
  })
  it('rejects mixed results and subject cardinality or identity mutations', () => {
    expect(() => parseTrustedImageProvenance([...result(), {}], request)).toThrow(Error)
    const original = result()[0]!
    const statement = original.verificationResult.statement
    for (const subject of [
      [],
      [...statement.subject, ...statement.subject],
      [{ name: 'evil', digest: { sha256: digest.slice(7) } }],
      [{ name: 'ghcr.io/vouchington/api', digest: { sha256: 'c'.repeat(64) } }],
      [{ name: 'ghcr.io/vouchington/api', digest: { sha512: digest.slice(7) } }],
      [{ name: 'ghcr.io/vouchington/api', digest: { sha256: digest.slice(7), sha512: 'x' } }],
    ]) {
      expect(() =>
        parseTrustedImageProvenance(
          [
            {
              verificationResult: {
                ...original.verificationResult,
                statement: { ...statement, subject },
              },
            },
          ],
          request,
        ),
      ).toThrow(Error)
    }
    expect(() =>
      parseTrustedImageProvenance(
        [
          {
            verificationResult: {
              ...original.verificationResult,
              statement: { ...statement, predicateType: 'evil' },
            },
          },
        ],
        request,
      ),
    ).toThrow(Error)
  })
  it('rejects empty and malformed results', () => {
    expect(() => parseTrustedImageProvenance([], request)).toThrow(Error)
    expect(() => parseTrustedImageProvenance([{}], request)).toThrow(Error)
  })
  it('rejects invalid runtime requests and missing signed envelopes', () => {
    for (const invalid of [
      { ...request, digest: 'sha512:bad' },
      { ...request, target: 'evil' },
      { ...request, mode: 'evil' },
    ]) {
      expect(() => buildImageAttestationVerifyArgs(invalid as typeof request)).toThrow(Error)
      expect(() => parseTrustedImageProvenance(result(), invalid as typeof request)).toThrow(Error)
    }
    for (const invalid of [
      null,
      {},
      [null],
      [{ verificationResult: [] }],
      [{ verificationResult: { signature: { certificate: [] } } }],
      [
        {
          verificationResult: {
            statement: { predicate: result()[0]!.verificationResult.signature.certificate },
          },
        },
      ],
    ])
      expect(() => parseTrustedImageProvenance(invalid, request)).toThrow(Error)
  })
  it('accepts the web publisher only for the web image', () => {
    const entry = result()[0]!
    entry.verificationResult.signature.certificate.subjectAlternativeName =
      'https://github.com/vouchington/vouchington/.github/workflows/publish-web-images.yml@refs/heads/main'
    entry.verificationResult.statement.subject[0]!.name = 'ghcr.io/vouchington/web'
    expect(parseTrustedImageProvenance([entry], { ...request, target: 'web' })).toHaveLength(1)
    expect(() => parseTrustedImageProvenance([entry], request)).toThrow(Error)
  })
})

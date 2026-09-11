import { createPrivateKey, sign as cryptoSign } from 'node:crypto'

export const KEY_ID = 'https://alice.example.com/ap/users/alice#main-key'
export const METHOD = 'POST'
export const PATH = '/inbox'
export const HOST = 'mastodon.social'
export const BODY = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })
export const FULL_HEADERS = ['(request-target)', 'host', 'date', 'digest']

interface ManualSignatureOptions {
  privateKeyPem: string
  method?: string
  path?: string
  host?: string
  dateHeader: string
  digestHeader: string
  headerNames: string[]
  additionalHeaders?: Record<string, string>
  keyId?: string
  // Pass null to omit the algorithm="..." parameter entirely from the Signature header.
  algorithm?: string | null
}

// Builds a `Signature` header value covering exactly `headerNames`, so edge cases (missing
// required headers, extra headers, alternate algorithms) can be constructed independently of
// `buildSignatureHeaders`, which always signs the full standard set.
export function buildManualSignature(options: ManualSignatureOptions): string {
  const {
    privateKeyPem,
    method = METHOD,
    path = PATH,
    host = HOST,
    dateHeader,
    digestHeader,
    headerNames,
    additionalHeaders = {},
    keyId = KEY_ID,
    algorithm,
  } = options

  const signingStringParts = headerNames.map(name => {
    if (name === '(request-target)') return `(request-target): ${method.toLowerCase()} ${path}`
    if (name === 'host') return `host: ${host}`
    if (name === 'date') return `date: ${dateHeader}`
    if (name === 'digest') return `digest: ${digestHeader}`
    return `${name}: ${additionalHeaders[name]}`
  })
  const signingString = signingStringParts.join('\n')

  const keyObject = createPrivateKey(privateKeyPem)
  const signature = cryptoSign('sha256', Buffer.from(signingString), keyObject).toString('base64')

  const headerParts = [`keyId="${keyId}"`]
  if (algorithm !== null) {
    headerParts.push(`algorithm="${algorithm ?? 'rsa-sha256'}"`)
  }
  headerParts.push(`headers="${headerNames.join(' ')}"`)
  headerParts.push(`signature="${signature}"`)
  return headerParts.join(',')
}

import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import { createRequest } from './api/server.mts'
import { createTestUserDirect } from './entities/users.mts'
import { updateUserFields } from '../services/users/index.mts'
import { buildSignatureHeaders } from '../modules/http-signatures/index.mts'

// The signature and the actual TCP destination don't need to match — Node reports whatever Host
// header the client sends as `req.headers.host`, and `inbox.mts` signs/verifies against that
// header value, not the real socket address. A fixed host keeps signing math simple across tests.
const INBOX_HOST = 'inbox-test.example'
const INBOX_URL = `http://${INBOX_HOST}/ap/inbox`
const INBOX_PATH = new URL(INBOX_URL).pathname

export function signInboxRequest(body: string, keyId: string, privateKeyPem: string) {
  return buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
}

// Mirrors buildSignatureHeaders but additionally covers `content-type` in the signed headers —
// the shape Mastodon actually sends. Exercises inbox.mts's additionalHeaders wiring end-to-end
// (Codex review finding #9), distinct from verify-headers.test.mts's lower-level unit coverage of
// verifySignature's additionalHeaders option itself.
export function signInboxRequestWithContentType(
  body: string,
  keyId: string,
  privateKeyPem: string,
  contentType: string,
) {
  const { digest, date } = signInboxRequest(body, keyId, privateKeyPem)
  const signingString = [
    `(request-target): post ${INBOX_PATH}`,
    `host: ${INBOX_HOST}`,
    `date: ${date}`,
    `digest: ${digest}`,
    `content-type: ${contentType}`,
  ].join('\n')

  const keyObject = createPrivateKey(privateKeyPem)
  const signature = cryptoSign('sha256', Buffer.from(signingString), keyObject).toString('base64')
  const signatureHeaderValue = [
    `keyId="${keyId}"`,
    'algorithm="rsa-sha256"',
    'headers="(request-target) host date digest content-type"',
    `signature="${signature}"`,
  ].join(',')

  return { signature: signatureHeaderValue, digest, date }
}

export async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { is_fediverse_federation_enabled: true })
  return user
}

export function postInbox(signature: { signature: string; digest: string; date: string }) {
  return createRequest()
    .post('/ap/inbox')
    .set('Host', INBOX_HOST)
    .set('Signature', signature.signature)
    .set('Digest', signature.digest)
    .set('Date', signature.date)
    .set('Content-Type', 'application/activity+json')
}

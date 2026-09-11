# @modules/http-signatures

Compatibility facade over `@vouchington/utils/http-signatures`. Cryptographic signing and
verification of HTTP requests for ActivityPub federation (RFC 9110 / Cavage-12 HTTP Signatures,
`rsa-sha256`/`hs2019`). The platform engine owns digest/sign/verify; this module injects the
required header set, allowed algorithms, 3600s maxAge, and treats a missing `algorithm` parameter
as `rsa-sha256`.

## Data model

None — this module is pure functions over PEM strings and header values. Persistence lives
elsewhere: `ap_actor_keys` (local actor keypairs, private key encrypted) and `remote_actors`
(remote actor public keys), both defined in `backend/data-stores/psql/migrations/`.

## Usage

```ts
import {
  generateRsaSha256KeyPair,
  buildSignatureHeaders,
  verifySignature,
  extractSignatureKeyId,
  computeDigest,
} from '@modules/http-signatures'

// Outbound: sign a request before delivery
const { digest, signature, date } = buildSignatureHeaders(
  'POST',
  targetInboxUrl,
  requestBody,
  actorKeyId, // @modules/activitypub-uris getActorKeyId(userId)
  decryptedPrivateKeyPem,
)

// Inbound: verify a request before trusting it
const keyId = extractSignatureKeyId(signatureHeader)
// ...look up (and fetch, if unknown) the remote actor's public key by keyId...
const result = verifySignature(
  method,
  path,
  host,
  body,
  signatureHeader,
  digestHeader,
  dateHeader,
  remoteActorPublicKeyPem,
)
```

## Rules

- Signatures must cover `(request-target)`, `host`, `date`, and `digest` — `verifySignature`
  rejects any signature missing one of these, closing a replay/host-confusion gap present in
  earlier drafts of this module that only required `(request-target)` and `digest`.
- Only `rsa-sha256` and `hs2019` algorithms are accepted.
- `verifyDigest` uses `timingSafeEqual` — never compare digests with `===`.
- This module never touches ciphertext or the encryption key. Callers decrypt the private key PEM
  (via `@modules/token-secrets` `decryptSecret`) immediately before calling `buildSignatureHeaders`
  and let it go out of scope immediately after.
- Actor identity (keyId, actor URI) is built by `@modules/activitypub-uris`, not here — this module
  only signs/verifies, it does not know about users or database identifiers.

## Related

- Backend rules: [../../CLAUDE.md](../../CLAUDE.md)
- ActivityPub URI builders: [../activitypub-uris/README.md](../activitypub-uris/README.md)
- Fediverse federation roadmap: [../../../docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md)
- Token secrets (private key encryption): [../token-secrets/README.md](../token-secrets/README.md)

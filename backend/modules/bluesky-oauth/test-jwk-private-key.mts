// Bundled ES256 (EC P-256) test private key, mirroring
// ts-shared/session-jwt/test-jwt-private-key.mts's pattern: used only as the dev/test fallback
// signing key in keyset.mts when VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64 is unconfigured. Never used
// in production — buildBlueskyKeyset() throws instead of falling back when mode === 'production'.
// No "use" field: @atproto/jwk-jose's JoseKey treats "use" on a private JWK as deprecated (it
// warns and migrates to "key_ops" internally) — omit it rather than trigger that migration path.
const testPrivateKey = {
  kty: 'EC',
  x: 'H1FwSv4yvA9SeafPFsWo2a4x3tDpTmcqgNf372kN1Ic',
  y: 'AYaY41ezo-nNMB6Wft4LFAdvSby1QwrMZZKJzvnopUA',
  crv: 'P-256',
  d: 'W56-dY_fQS9mIdMb2w7c4dcp5rRo4T8O_6GosXm0sNw',
  alg: 'ES256',
  kid: 'bluesky-test-key-1',
} as const

export default testPrivateKey

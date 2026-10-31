// Schema fixtures can create topics with TOTP credentials; keep a synthetic key available without
// loading the full PostgreSQL/Valkey test-store global setup.
process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS ??=
  'fake-test-key:raw32:this fake test key is not secret'

import { setResolveMxRecordsForDomainValidationTest } from '@services/email-address-validator/domain-validation.mts'

// Content-creation endpoints (posts, comments, community posts, community creation, topic
// recommendations, reports) now require a Cloudflare Turnstile token verified via siteverify.
// Regular DB-backed route and web-api integration tests create those entities through the HTTP
// app but cannot reach (and must not depend on) Cloudflare. This flag makes verifyCaptchaToken a
// no-op for those suites; the captcha contract itself is covered by dedicated `.mock.test.mts`
// files that mock the captcha service, and backend startup refuses to boot with this flag set in
// production. Use `??=` so an explicit override (e.g. a test asserting the real path) wins.
process.env.SKIP_CAPTCHA_VERIFICATION ??= 'true'

// example.com, example.net, and example.org publish no MX records, so a real lookup cannot
// satisfy "this domain can receive mail." Answer that check here instead of querying public DNS.
// `.invalid` and `.test` stay undeliverable. A test that needs a different answer replaces this
// with setResolveMxRecordsForDomainValidationTest.
const SYNTHETIC_MX = [{ exchange: 'example.com', priority: 10 }]
setResolveMxRecordsForDomainValidationTest(async domain => {
  const normalized = domain.toLowerCase().trim().replace(/\.$/, '')
  if (normalized.endsWith('.invalid') || normalized.endsWith('.test')) return []
  return SYNTHETIC_MX
})

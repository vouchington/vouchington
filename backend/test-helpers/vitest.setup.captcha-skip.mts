// Content-creation endpoints (posts, comments, community posts, community creation, topic
// recommendations, reports) now require a Cloudflare Turnstile token verified via siteverify.
// Regular DB-backed route and web-api integration tests create those entities through the HTTP
// app but cannot reach (and must not depend on) Cloudflare. This flag makes verifyCaptchaToken a
// no-op for those suites; the captcha contract itself is covered by dedicated `.mock.test.mts`
// files that mock the captcha service, and backend startup refuses to boot with this flag set in
// production. Use `??=` so an explicit override (e.g. a test asserting the real path) wins.
process.env.SKIP_CAPTCHA_VERIFICATION ??= 'true'

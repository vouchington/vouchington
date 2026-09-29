# CAPTCHA

[Back to Communities API](../../../../../backend/api/v1/communities/README.md#captcha)

`POST /api/v1/communities` (create community) and `POST /api/v1/communities/:idOrSlug/posts` (create community post) require a Cloudflare Turnstile token in the request body field `cf_turnstile_response`. Each route calls `verifyCaptchaToken` (see [`@services/captcha`](../../../../overview/architecture/services/captcha/README.md)) after auth/honeypot checks — `422` if the token is missing, `400` if Cloudflare rejects it, `502` if siteverify is unreachable. Requests carrying valid Apple App Attest headers bypass this Turnstile requirement for both routes — see [App Attest bypass](../../../../overview/architecture/services/captcha/README.md#app-attest-bypass) in `@services/captcha` (actionTags: `communities.create`, `communities.create-post`).

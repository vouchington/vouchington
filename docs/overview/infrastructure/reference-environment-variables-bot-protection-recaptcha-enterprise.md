# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Bot Protection (reCAPTCHA Enterprise)

A second, invisible score-based signal layered alongside Turnstile on post/comment creation only.
Monitor-only by default; see [captcha.md](../architecture/captcha.md).

| Name                                    | Required in prod | Where          | Notes                                                                                                 |
| --------------------------------------- | ---------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `GOOGLE_RECAPTCHA_PROJECT_ID`           | No¹              | ECS            | GCP project id for the `createAssessment` call.                                                       |
| `GOOGLE_RECAPTCHA_API_KEY`              | No¹              | SM             | API key authorizing `createAssessment`.                                                               |
| `GOOGLE_RECAPTCHA_SITE_KEY`             | No¹              | ECS            | Public site key sent in the assessment `event`. Same value as the web var below.                      |
| `NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY` | No¹              | Runtime public | Public site key used by the `enterprise.js` loader.                                                   |
| `GOOGLE_WEB_RISK_API_KEY`               | No               | SM             | API key for Google Web Risk URL lookups. Also gated by disabled-by-default `web-risk-config.enabled`. |

¹ Not required to boot. There is no usable score-based test key, so reCAPTCHA is simply skipped
(fail-open) whenever any credential is missing, when the process isn't a deployed environment
(`ENVIRONMENT` is not `staging` or `production`, via `@ts-shared/deploy-environment`'s
`isDeployedEnvironment()`), or when the `recaptcha-config` DynamicConfig `enabled` flag is `false`
(the shipped default). Enable it per environment via `/admin/dynamic-config` once real credentials
are provisioned.

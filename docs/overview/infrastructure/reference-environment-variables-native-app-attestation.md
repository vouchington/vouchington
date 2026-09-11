# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Native App Attestation

Apple App Attest lets attested native clients bypass Turnstile on the 8 gated endpoints and
qualifies devices for 30-day sessions. See [app-attestation.md](../architecture/app-attestation.md).

| Name                         | Required in prod | Where | Notes                                                  |
| ---------------------------- | ---------------- | ----- | ------------------------------------------------------ |
| `APPLE_APP_ATTEST_TEAM_ID`   | No¹              | ECS   | Apple Developer Team ID (10-char alphanumeric).        |
| `APPLE_APP_ATTEST_BUNDLE_ID` | No¹              | ECS   | Bundle identifier of the native app allowed to attest. |

¹ Only required when the `app-attestation-config` DynamicConfig `enabled` flag is turned on for an
environment. The variables are always injected into the backend ECS task definition (defaulting to
`""` and `"ai.voucha.ios"` respectively) via Terraform; `getAppleAppAttestTeamId()`/`getAppleAppAttestBundleId()`
throw if read while unset in the application code.
Distinct from `APPLE_TEAM_ID` (used for Sign in with Apple's client-secret JWT) — App Attest and
Sign in with Apple are independent Apple integrations with separate credentials.

# App Attest reference

[Back to App Attest](app-attestation.md)

## Configuration

### Env vars

| Var                          | Purpose                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `APPLE_APP_ATTEST_TEAM_ID`   | Apple Developer Team ID; half of the app ID Apple's attestation statement is checked against |
| `APPLE_APP_ATTEST_BUNDLE_ID` | App bundle identifier; the other half of the expected app ID                                 |

### DynamicConfig (`app-attestation-config`)

Registered in `@services/dynamic-config-admin` with administrator-only updates
(`update_roles: []`) because these fields control Turnstile bypass and request-signing
enforcement. It is editable at `/admin/dynamic-config`:

| Field                            | Default | Meaning                                                                                                     |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `enabled`                        | `false` | Master switch for the Turnstile bypass. Does not affect the challenge/attest routes themselves              |
| `require_attestation_for_bypass` | `false` | Second gate that must also be `true` for the bypass to take effect                                          |
| `allow_development_attestation`  | `false` | Accept Apple's `development` attestation environment (Xcode debug builds) instead of requiring `production` |
| `request_signing_mode`           | `off`   | Per-request ECDSA signing mode for attested iOS devices: `off`, `observe`, or `enforce`                     |

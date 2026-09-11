# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Web Client Auth Boundary

The root server component resolves the private user once, then projects it before crossing into
client components. `AuthProvider` receives only the user ID, roles, and a derived official-account
boolean. It must not receive the private API `User` shape or expose client-side user mutation.

UI that needs other account data receives a dedicated narrow view model. The root shell separately
projects profile-menu identity and suspension notice data, while settings pages pass only their
form-specific initial fields to client forms. Server components should continue using the cached
`getCurrentUser()` or `requireCurrentUser()` helpers.

## Tokens

Every visitor (anonymous or authenticated) holds two HTTP-only cookies:

| Cookie | Expiry                                              | Contains                                                            |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| `dt`   | 30 days                                             | Device JWT — identifies the device                                  |
| `st`   | 2 days (30 days for an attested device — see below) | Session JWT — identifies the session; includes `uid` when logged in |

Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production only. The `maxAge` for each cookie is returned by the backend's `PATCH /api/v1/session` response (`dte` for the device token, `ste` for the session token), making expiry backend-controlled. `sameSite=lax` is one layer of CSRF defense — see [CSRF Protection](../../requirements/security/CSRF.md) for the full threat model.

Session expiry is computed by `sessionExpiryFor(dc)` / `sessionExpirySecondsFor(dc)`
(`ts-shared/session-jwt/constants.mts`) from the device token's `dc` claim: 30 days when
`dc === 'attested'`, 2 days otherwise. The device token's own 30-day expiry never changes. See
[App Attest](app-attestation.md) for how a device becomes attested.

### JWT Payload

**Device token (`dt`):** `{ did: string, aud: 'voucha:device', dc?: 'attested' }`

`dc` (DeviceClass) is set only once a device completes Apple App Attest key registration (see
[App Attest](app-attestation.md)); it is never present on the session token payload below — only
the session token's _expiry_ depends on it.

**Session token (`st`):**

```
{
  did: string       // device ID (must match dt)
  sid: string       // session ID (UUIDv7)
  uid: string|null  // user ID (valid UUID; null for anonymous)
  aud: 'voucha:session'
  // Authenticated-only enrichment fields:
  rol?: string[]    // user roles (e.g. ['administrator'])
  mpl?: string|null // membership plan slug ('plus' | 'pro')
  tt?: number       // pre-computed trust tier (0–5)
  uil?: string|null // UI locale used by the web session
  rca?: number      // recheck-after: Unix epoch seconds — re-read user from DB after this time
  sca?: number      // session-check-after: Unix epoch seconds — check Valkey after this time
}
```

Audience (`aud`) scoping prevents a device token from being accepted as a session token and vice
versa.

Verification also rejects signed tokens whose required payload claims are absent or malformed:
device tokens must include a valid UUID `did`, and session tokens must include valid UUID `did`
and `sid` claims plus `uid` as either a valid UUID string or `null`. Optional enrichment claims are
type-checked before downstream auth code receives the payload. The auth service mints new `did`,
`sid`, and authenticated `uid` values as UUIDv7; legacy UUID session/device IDs are rotated to
UUIDv7 when refreshed.

# Authentication — Manual Testing Checklist

> This file is a QA checklist for manual authentication testing. For authentication architecture, see [auth-overview.md](../../overview/architecture/auth-overview.md). For security requirements, see [SECURITY.md](SECURITY.md). For which action buttons are visible to signed-out users, see [SIGNED_OUT_ACTIONS.md](../navigation/SIGNED_OUT_ACTIONS.md).

## Manual Testing Checklist

Prerequisites:

- Dev server running (`./dev/tmux`)
- Test accounts for Facebook, X, and GitHub
- The provider credentials under test configured in `~/voucha.env`
- The provider and client mode enabled under the `oauth-authorization-broker` dynamic config key;
  all six provider/mode fields default to `false`
- For legacy Facebook fallback testing only, `NEXT_PUBLIC_META_APP_ID` set in `web/.env.local`

---

### Login page (`/login`)

- [ ] Page shows the email input and one button for each server-advertised provider
- [ ] A broker-enabled provider does not depend on a browser SDK or runtime public client ID
- [ ] Disabling a provider's broker field removes its broker button; Facebook may use its existing
      SDK flow only when the legacy public configuration remains present

### Brokered provider login flow

1. Visit `/login` (logged out)
2. Click **Continue with Facebook**, **Continue with X**, or **Continue with GitHub**
3. Confirm a blank popup opens synchronously, then navigates to the provider
4. Approve the provider authorization
5. Confirm the popup completes on the Voucha callback page, closes, and the opener redirects to `/`
6. Confirm no provider code, access token, PKCE verifier, or completion credential is exposed to
   opener JavaScript
7. Confirm the username/avatar appears in the navbar
8. Repeat with provider denial and confirm the login page shows a retryable error
9. Repeat an already-completed callback and confirm it does not create another account or session
10. Lose the first terminal completion response, then confirm the callback page retries with the
    same path-scoped HttpOnly credential and relays the durable result exactly once
11. Confirm the opener acknowledges receipt of a terminal result before the popup consumes the
    completion credential; terminate the popup before receipt and confirm reload can replay, then
    lose only the backend acknowledgement after receipt and confirm the delivered result remains
    usable while the remaining credential expires with the authorization

### Native broker resume

1. Start Facebook, X, or GitHub authentication in a native client
2. Background or terminate the app before approving the provider
3. Approve the provider authorization and reopen through the custom-scheme callback
4. Confirm the app restores the secure pending authorization and completes exactly once
5. Repeat after deleting the app-held proof and confirm the intercepted callback cannot complete
6. Repeat for an account that requires MFA and confirm the MFA attempt survives page recreation
   and app restart until verification succeeds; explicitly cancel and confirm restart does not
   reopen the challenge
7. Make secure callback persistence temporarily unavailable, then confirm retry claims the same
   delivered callback and explicit cancel discards it before a fresh authorization starts
8. Make secure MFA-result persistence temporarily unavailable, then confirm retry and cancel remain
   available for the same finalizing authorization
9. Force completion or identity refresh to fail, then confirm retry completes the same durable
   authorization and cancel clears it without restarting the app
10. Make secure storage temporarily unavailable during app initialization or resume, confirm the
    pending verifier or MFA result is retained, then restore storage and confirm resume recovers it
11. Make secure storage fail during explicit cancel, then confirm the native UI remains responsive,
    retains the pending authorization or MFA result, and a later cancel retry clears it
12. Lose the first successful response body, retry with its newly issued authenticated session, and
    confirm only that same device and durable result user can replay the completion
13. Submit two completion requests concurrently while signed out and confirm both responses use the
    same authenticated device and session IDs and only one active session is registered

### Email OTP login flow

1. Visit `/login` (logged out)
2. Enter your email address and click **Continue with email**
3. The form transitions to the verification code step — "Check your email for a verification code." toast appears
4. OAuth buttons are hidden while the verification code step is shown
5. Click **Back** and verify the email step returns with OAuth buttons visible again
6. Re-enter the email if needed, enter the code from the email, and click **Log in**
7. You are redirected to `/`

### Email login link deep link

1. Request an email OTP
2. Open the login email
3. Verify the email includes the full `/login?emailAddress=...&otp=...` URL in addition to the CTA button
4. Click the CTA or pasted URL
5. `/login` opens directly on the verification code step with the email address and OTP prefilled
6. The form auto-submits once without another click
7. You are redirected to `/`

#### Error cases

- Enter an invalid/expired code → toast: "Invalid or expired verification code"
- Click **Back** on the code step → returns to email input, code is cleared, OAuth buttons reappear

### Connect a provider on identity page (`/my/identity`)

#### When not connected

1. Log in (via email OTP or test user API)
2. Visit `/my/identity`
3. Scroll to the Facebook, X, or GitHub section
4. Click its connect button
5. Approve the provider popup
6. Confirm the section shows the provider identity with a "Connected" badge
7. Reload and confirm the connected state persists
8. Replay the completion and confirm friend synchronization is scheduled only once

#### When already connected

1. Visit `/my/identity`
2. The provider section shows the connected identity and disconnect action
3. Disconnect the provider and confirm the section returns to its connection action

### Already logged in redirect

1. Log in successfully
2. Visit `/login` directly
3. Should redirect to `/`

### Logout

1. Log out (via navbar or API call)
2. Visit `/my/identity` → redirected to `/login`
3. Reload `/login` after navbar logout → remain signed out

### Active sessions

1. Visit `/my/identity`
2. Verify the active sessions section shows each signed-in device
3. Click **Sign out** on the current device
4. The page routes to `/login`
5. Sign back in, then click **Sign out all devices**
6. The page routes to `/login`

## Related

- [Auth overview](../../overview/architecture/auth-overview.md) — authentication architecture and edge/session flow
- [Security](SECURITY.md) — auth security requirements
- [Signed-out actions](../navigation/SIGNED_OUT_ACTIONS.md) — anonymous CTA behavior
- [Web rules](../../../web/CLAUDE.md) — auth UI and client data-loading conventions
- [Backend rules](../../../backend/CLAUDE.md) — auth service and API conventions
- [OAuth broker rollout](../../operations/oauth-authorization-broker-rollout.md) — rollout,
  rollback, and recovery verification

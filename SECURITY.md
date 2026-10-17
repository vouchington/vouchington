# Security Policy

## Reporting a Vulnerability

If you believe you've found a security vulnerability in Voucha, please report
it privately through GitHub's built-in reporting flow rather than filing a
public issue:

1. Go to the [Security tab](https://github.com/vouchington/vouchington/security) of this repository.
2. Click **Report a vulnerability**.
3. Fill in as much detail as you can: affected component, reproduction steps,
   and potential impact.

**Please do not open a public issue for a suspected vulnerability.** Private
reporting lets us investigate and ship a fix before the details are public.

We don't currently run a paid bug bounty program. You can expect an
acknowledgement within a few business days, and we'll keep you updated as we
investigate and work toward a fix.

## Supported Versions

Voucha is an application, not a versioned library — there are no supported
release branches or version table to consult. Security fixes land on `main`
and are deployed from there; there is no older version to patch separately.

## Not Vulnerabilities

The following are intentional, non-sensitive test fixtures and are not
vulnerabilities:

- [`ts-shared/session-jwt/test-jwt-private-key.mts`](ts-shared/session-jwt/test-jwt-private-key.mts)
- [`backend/modules/bluesky-oauth/test-jwk-private-key.mts`](backend/modules/bluesky-oauth/test-jwk-private-key.mts)

Both are synthetic, non-production signing keys used only as a development/test fallback; the
consuming code refuses to fall back to them in production mode.

If you find a way around that production-mode guard, that **is** worth
reporting through the process above.

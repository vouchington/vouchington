# @services/oauth-accounts

Low-level OAuth account storage shared by `@services/oauth`, all provider services (`@services/oauth-google`, `@services/oauth-facebook`, etc.), and `@services/users`: upserting provider accounts, linking them to users, encrypting tokens, and decoding JWT parts.

## Data model

Each provider has its own table (`providerTableConfigs`), all shaped the same way:

| Provider  | Table                | Has token columns | Has refresh token | User-data conflict strategy |
| --------- | -------------------- | ----------------- | ----------------- | --------------------------- |
| facebook  | `facebook_accounts`  | yes               | no                | replace                     |
| apple     | `apple_accounts`     | no                | no                | merge                       |
| google    | `google_accounts`    | no                | no                | replace                     |
| x         | `x_accounts`         | yes               | yes               | replace                     |
| linkedin  | `linkedin_accounts`  | yes               | yes               | replace                     |
| microsoft | `microsoft_accounts` | yes               | yes               | replace                     |
| github    | `github_accounts`    | yes               | yes               | replace                     |

Every table has `user_id`, `<provider>_user_id`, `<provider>_user_email_address`, and `<provider>_user_data` columns. Providers with token columns also have `access_token_ciphertext` and `access_token_expires_at`; providers with a refresh token also have `refresh_token_ciphertext`. Tokens are always stored encrypted via `@modules/token-secrets`, never in plaintext.

Apple's user-data conflict strategy atomically merges stored JSON with newly supplied fields
because Apple returns the profile name only with the initial authorization response. A restarted
sign-in can therefore update repeated claims without erasing that one-time name. Other providers
replace their user-data object with the latest complete provider response.

## Key exports

```typescript
import {
  upsertOAuthAccount,
  connectOAuthAccountToUser,
  assertValidProvider,
} from '@services/oauth-accounts'

const provider = assertValidProvider(providerParam) // throws 400 for unknown providers
const account = await upsertOAuthAccount(provider, providerUserId, email, providerUserData, {
  accessToken,
  refreshToken,
  accessTokenExpiresAt,
})
await connectOAuthAccountToUser(provider, currentUserId, providerUserId)
```

- `OAuthProvider` — `'facebook' | 'apple' | 'google' | 'x' | 'linkedin' | 'microsoft' | 'github'`
- `OAuthAccount` — `{ user_id, provider_user_id, provider_user_email_address, provider_user_data }`
- `providerTableConfigs` — per-provider table/column config (see data model above)
- `oauthProviders` — `OAuthProvider[]` derived from `providerTableConfigs`
- `assertValidProvider(provider)` — narrows a string to `OAuthProvider`, throwing `400` if it isn't one of `oauthProviders`
- `upsertOAuthAccount(provider, providerUserId, providerUserEmailAddress, providerUserData, tokens?)` — inserts or updates the provider's account row; encrypts `tokens.accessToken`/`tokens.refreshToken` before storing. Throws `401` for an empty `providerUserId`, `500` if the write returns no row.
- `getOAuthTokenPurpose(provider, providerUserId, column)` — the purpose string (`oauth:<provider>:<providerUserId>:<column>`) used to scope token encryption/decryption
- `connectOAuthAccountToUser(provider, userId, providerUserId, options?)` — atomically links an
  existing provider account row to a user (only if unlinked or already linked to that user) and
  clears `users.vote_weight_recalculated_at`, leaving durable intent for the vote-weight dispatcher.
  Callers run the immediate recalculation enqueue and best-effort verified-email cache invalidation
  after commit. Throws `409` if linked to another user, `404` if the account doesn't exist.
- `getOAuthAccountByProviderUserId(provider, providerUserId)` — looks up an account row by provider user ID, or `null`
- `decodeJwtPart(part)` — base64url-decodes and JSON-parses a JWT segment (header/payload); throws `422` on malformed input

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth orchestration: [../oauth/README.md](../oauth/README.md)
- Token encryption: [../../modules/token-secrets/README.md](../../modules/token-secrets/README.md)

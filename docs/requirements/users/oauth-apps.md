# OAuth Apps and Connected Apps

OAuth apps and connected apps are the OAuth counterparts of [API keys](api-keys.md): a developer
owns an app that asks users for access, and each user sees and revokes the apps they approved. The
protocol, client types and verification rules live in the
[OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md) requirements.

## OAuth apps

Developers register their own OAuth apps from settings instead of relying only on anonymous dynamic
registration, so an app that asks users for access has an accountable owner. The
[OAuth app routes](../../../backend/api/v1/my/reference-oauth-apps.md) list, register, rename or
re-point, revoke, and rotate the secret of the caller's own apps.

Registration goes through the same client-name, redirect-URI and auth-method validators as dynamic
registration, and `scopes` is a list of catalogue scopes (at most 32). A confidential app's client
secret is returned only by registration and rotation, is stored as a hash and is never readable
afterwards; public apps have no secret, so rotation returns 409. Renaming an app or changing its
redirect URIs clears staff verification, because staff verified the old name and destinations;
administrators verify an app's name and redirect URIs from the
[Admin API](../../../backend/api/v1/admin/README.md).
Removing a redirect URI also cancels sign-ins still waiting on it: a pending consent request or an
unexchanged authorization code for that URI is refused.
Revoking an app stops its access tokens, refresh tokens and authorization codes on their next use and
removes its grants from every user's connected apps. Other users' apps return 404, and suspended
users cannot change apps.

## Connected apps

Agents that connect through OAuth rather than a pasted key appear on the user's connected-apps list,
so AI-agent access stays visible to the user.

| Method   | Path                          | Description                         |
| -------- | ----------------------------- | ----------------------------------- |
| `GET`    | `/api/v1/my/oauth-grants`     | List the OAuth apps you approved    |
| `DELETE` | `/api/v1/my/oauth-grants/:id` | Revoke an app's access to your data |

Each grant shows the client name, whether staff verified that name, the protected resource, the
granted scopes, when consent was given and when the app last used its access. Revoking a grant stops
its access and refresh tokens on their next use; consenting again creates a new grant. Suspended
users cannot revoke grants, matching API-key management.

## Settings

Settings > API Keys (`/my/api-keys`) lists the caller's OAuth apps below their keys. Registering an
app takes a name, one redirect URI per line, a confidential or public client type and
[catalogue](api-keys.md#scope-catalogue) scopes that accept the `oauth` surface; admin-audience
scopes are offered only to administrators. A confidential app's client secret appears once, after
registration or rotation, in a dismissible alert with a copy button. Each app row shows its client
ID, redirect URIs, scopes and verification badge; editing sends only the changed name or redirect
URIs and warns that saving clears verification, rotating asks for confirmation (confidential apps
only), and revoking asks for confirmation.

Settings > Connected apps (`/my/connected-apps`) lists the grants on the account, with a verified or
unverified badge, the granted scopes and the consent and last-used dates, and revokes one after
confirmation.

## Related

- [API keys](api-keys.md) — pasted-key access and the scope catalogue
- [OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md) — protocol, client types
  and staff verification
- [OAuth app routes](../../../backend/api/v1/my/reference-oauth-apps.md)

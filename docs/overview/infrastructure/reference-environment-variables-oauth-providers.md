# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## OAuth Providers

Each provider needs a server-side secret and a browser-visible client ID. Client IDs are public
provider config, not credentials; new work should supply them as runtime-public config instead of
Docker build args.

### Google

| Name                           | Required | Where          | Notes                 |
| ------------------------------ | -------- | -------------- | --------------------- |
| `GOOGLE_CLIENT_ID`             | Yes      | ECS            | Server-side client ID |
| `GOOGLE_CLIENT_SECRET`         | Yes      | SM             | Server-side secret    |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes      | Runtime public | Client-side client ID |

### Apple

| Name                          | Required | Where          | Notes                                                                    |
| ----------------------------- | -------- | -------------- | ------------------------------------------------------------------------ |
| `APPLE_CLIENT_ID`             | Yes      | ECS            | Service ID                                                               |
| `APPLE_NATIVE_CLIENT_IDS`     | No       | ECS            | Comma-separated native app bundle IDs                                    |
| `APPLE_TEAM_ID`               | Yes      | SM             | Team ID                                                                  |
| `APPLE_KEY_ID`                | Yes      | SM             | Key ID                                                                   |
| `APPLE_PRIVATE_KEY`           | Yes      | SM             | Private key (PEM)                                                        |
| `NEXT_PUBLIC_APPLE_CLIENT_ID` | Yes      | Runtime public | Client-side service ID                                                   |
| `VOUCHA_WEB_BASE_URL`         | No       | Native app env | Native browser callback origin; falls back to `SITEMAP_BASE_URL` locally |

### X (Twitter)

| Name                      | Required   | Where          | Notes                 |
| ------------------------- | ---------- | -------------- | --------------------- |
| `X_CLIENT_ID`             | If enabled | ECS            | OAuth 2.0 client ID   |
| `X_CLIENT_SECRET`         | If enabled | SM             | OAuth 2.0 secret      |
| `NEXT_PUBLIC_X_CLIENT_ID` | If enabled | Runtime public | Client-side client ID |

### Facebook

| Name                          | Required   | Where          | Notes              |
| ----------------------------- | ---------- | -------------- | ------------------ |
| `FACEBOOK_APP_ID`             | If enabled | ECS            | App ID             |
| `FACEBOOK_APP_SECRET`         | If enabled | SM             | App secret         |
| `NEXT_PUBLIC_FACEBOOK_APP_ID` | If enabled | Runtime public | Client-side app ID |

### LinkedIn

| Name                             | Required   | Where          | Notes                 |
| -------------------------------- | ---------- | -------------- | --------------------- |
| `LINKEDIN_CLIENT_ID`             | If enabled | ECS            | Client ID             |
| `LINKEDIN_CLIENT_SECRET`         | If enabled | SM             | Client secret         |
| `NEXT_PUBLIC_LINKEDIN_CLIENT_ID` | If enabled | Runtime public | Client-side client ID |

### Microsoft

| Name                              | Required   | Where          | Notes                                     |
| --------------------------------- | ---------- | -------------- | ----------------------------------------- |
| `MICROSOFT_CLIENT_ID`             | If enabled | ECS            | Client ID                                 |
| `MICROSOFT_CLIENT_SECRET`         | If enabled | SM             | Client secret                             |
| `MICROSOFT_TENANT_ID`             | If enabled | ECS            | Tenant ID (default: `common`)             |
| `NEXT_PUBLIC_MICROSOFT_CLIENT_ID` | If enabled | Runtime public | Client-side client ID                     |
| `NEXT_PUBLIC_MICROSOFT_TENANT_ID` | If enabled | Runtime public | Client-side tenant ID (default: `common`) |

### GitHub

| Name                           | Required   | Where          | Notes                 |
| ------------------------------ | ---------- | -------------- | --------------------- |
| `GITHUB_CLIENT_ID`             | If enabled | ECS            | Client ID             |
| `GITHUB_CLIENT_SECRET`         | If enabled | SM             | Client secret         |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | If enabled | Runtime public | Client-side client ID |

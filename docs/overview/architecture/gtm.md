# Server-Side Google Tag Manager (sGTM)

## Architecture

Browser tracking requests go directly to the dedicated GTM host `https://g.voucha.ai`. GTM cannot be proxied through the Cloudflare Worker, so the web app loads the script from that host explicitly after the user grants analytics consent.

```
Browser                        g.voucha.ai
  |                                  |
  |-- GET /gtm.js ------------------>|
  |<-- gtm.js -----------------------|
  |                                  |
  |-- POST /g/collect -------------->|
  |<-- 200 + Set-Cookie -------------|
```

## Environment Variables

| Variable             | Where          | Purpose                                                  |
| -------------------- | -------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_GTM_ID` | Runtime public | GTM container ID (e.g., `GTM-XXXXXX`). Empty = disabled. |

## Enabling GTM

1. Set `NEXT_PUBLIC_GTM_ID=GTM-XXXXXX` in the web runtime-public environment config
2. Ensure your GTM container is served from `https://g.voucha.ai`
3. Restart the web server

When `NEXT_PUBLIC_GTM_ID` is unset, GTM is fully disabled and the browser never makes requests to `g.voucha.ai`. The ID is public browser config and must stay runtime-configured, not baked into Docker images.

GTM is loaded client-side only after `cookie-consent` is set to `all` in local storage and the browser is not sending Global Privacy Control (`navigator.globalPrivacyControl === true`). GPC is a runtime override: it suppresses GTM even when stale local consent says `all`, but it does not rewrite local storage. The app does not render a `<noscript>` iframe fallback because the fallback would either bypass consent or never run under the current client-side consent model.

Cookie consent behavior and test coverage are tracked in the [User Privacy Feature Matrix](../../requirements/users/USER-PRIVACY-MATRIX.md).

## Disabling GTM

Remove or leave `NEXT_PUBLIC_GTM_ID` unset. In this mode, the root layout still renders the no-op GTM consent loader, but no GTM scripts are injected and no tracking calls are sent.

## Adding Custom Events

Import `pushEvent` from `@/lib/gtm/data-layer` in any client component:

```typescript
import { pushEvent } from '@/lib/gtm/data-layer'

// Push a typed event
pushEvent({ event: 'sign_up', method: 'email' })
pushEvent({ event: 'login', method: 'google' })

// Push a custom event
pushEvent({ event: 'my_custom_event', custom_param: 'value' })
```

Only push custom analytics events after the same consent gate has passed (`cookie-consent` is `all` and GPC is inactive). `pushEvent` writes to `window.dataLayer` directly and does not check consent by itself.

To add a new typed event, extend the union in `web/lib/gtm/types.ts`:

```typescript
export type MyCustomEvent = {
  event: 'my_custom_event'
  custom_param: string
}

export type GtmEvent = PageViewEvent | SignUpEvent | LoginEvent | MyCustomEvent
```

## Development Setup

For local development:

1. Make sure `g.voucha.ai` points at a working sGTM container
2. Set `NEXT_PUBLIC_GTM_ID` in runtime-public config
3. Grant analytics consent by accepting all cookies or setting `cookie-consent=all` in local storage
4. Verify `https://g.voucha.ai/gtm.js?id=GTM-XXXXXX` loads in the browser

Without a working GTM host at `g.voucha.ai`, the browser will fail to load the GTM script after analytics consent is granted.

## Key Files

- `web/lib/gtm/` — GTM module (types, dataLayer helper, React components)
- `cloudflare-worker/src/csp.mts` — enforced CSP allowlist for `https://g.voucha.ai`

## Related

- [Backend rules](../../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../../web/CLAUDE.md) — UI and routing conventions

- [docs/overview/architecture/ai-agents.md](./ai-agents.md)
- [docs/overview/architecture/auth-overview.md](./auth-overview.md)

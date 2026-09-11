# Honeypot Service

Zero-friction bot detection using hidden form fields. Bots that auto-fill forms will trigger these fields; legitimate users never see or interact with them.

## Usage

```typescript
import { isHoneypotTriggered } from '@services/honeypot'

// In a route handler:
const body = await ctx.request.json('100kb')
if (isHoneypotTriggered(body as Record<string, unknown>)) {
  // Return a plausible-looking fake success — don't reveal detection
  ctx.json({/* fake response */})
  return
}
```

## Honeypot field names

| Field        | Why chosen                                                            |
| ------------ | --------------------------------------------------------------------- |
| `hp_website` | Non-standard name bots still fill; avoids browser autofill heuristics |
| `hp_phone`   | Non-standard name bots still fill; avoids browser autofill heuristics |

> **Note:** Standard names like `website` and `phone` were intentionally avoided — browsers autofill those, which would block legitimate users.

## Data model

`isHoneypotTriggered` accepts the raw request body (`Record<string, unknown>`). It reads only the honeypot fields; all other keys are ignored.

| Field        | Type                | Trigger rule                                    |
| ------------ | ------------------- | ----------------------------------------------- |
| `hp_website` | `string` (optional) | Non-null and non-empty after `String(v).trim()` |
| `hp_phone`   | `string` (optional) | Non-null and non-empty after `String(v).trim()` |

Any non-string, non-null value (e.g. a number or boolean) is coerced to string — bots cannot bypass detection by sending the wrong type.

## Behavior

- **Empty or absent** → `isHoneypotTriggered` returns `false` — request proceeds normally
- **Non-empty** → `isHoneypotTriggered` returns `true` — caller returns a fake success response

Bots must not learn they were detected. Routes return plausible success responses:

| Route                                    | Honeypot response             |
| ---------------------------------------- | ----------------------------- |
| `POST /api/v1/auth/email-address/tokens` | `200 { email_address: ... }`  |
| `POST /api/v1/auth/email-address/login`  | `401` (same as invalid token) |
| `POST /api/v1/posts`                     | `201 { post: { id, ... } }`   |

## Forms with honeypot fields

- Login / signup form ([`web/components/auth/login-form.tsx`](../../../web/components/auth/login-form.tsx))
- Post creation form ([`web/components/posts/post-form.tsx`](../../../web/components/posts/post-form.tsx))

## Adding honeypot to a new form

1. Add hidden `<Input name="hp_website">` and `<Input name="hp_phone">` with the standard styles:
   ```tsx
   <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, visibility: 'hidden' }}>
     <Input name="hp_website" type="text" tabIndex={-1} autoComplete="off" ... />
     <Input name="hp_phone"   type="text" tabIndex={-1} autoComplete="off" ... />
   </div>
   ```
2. Pass the field values through to the API call body.
3. In the backend route handler, call `isHoneypotTriggered(body)` before any business logic.

## Related

- [Captcha Service](../captcha/README.md)
- [Spam Detection Service](../spam-detection/README.md)

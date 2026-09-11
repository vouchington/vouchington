# Authenticated `(my)` routes

Pages under `web/app/(my)/my/`. Parent web rules: [../../CLAUDE.md](../../CLAUDE.md).

## Invariants

- **`force-dynamic`**: `force-dynamic-pages` enforces `export const dynamic = 'force-dynamic'` on
  every `web/app/**/page.tsx`; `(my)/layout.tsx` is not enough.
- **Auth guard**: `(my)/layout.tsx` already redirects signed-out users. Do not add page-level
  `/login?next=` redirects under `(my)/my`. When the page needs the user, call
  `requireCurrentUser()` from `@/lib/auth/require-current-user`.

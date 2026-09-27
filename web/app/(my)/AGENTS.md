# Authenticated routes

- Every `web/app/**/page.tsx` exports `dynamic = 'force-dynamic'`; `(my)/layout.tsx` alone is insufficient (`force-dynamic-pages` guard).
- `(my)/layout.tsx` owns signed-out redirects; never add page-level `/login?next=` redirects under `(my)/my`. Pages needing users call `requireCurrentUser()` from `@/lib/auth/require-current-user`.

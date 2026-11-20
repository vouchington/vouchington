# Authenticated routes

- `(my)/layout.tsx` owns signed-out redirects; never add page-level `/login?next=` redirects under
  `(my)/my`. Pages needing users call `requireCurrentUser()` from `@/lib/auth/require-current-user`.

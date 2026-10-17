# Asides

Right-sidebar content is passed per page as the `aside` prop of `PageWithAside` and rendered
server-side. Which asides appear where is read from the pages.

## Rules

- Asides shown only to signed-in users or administrators are React Server Components that check
  auth on the server, so auth-gated code stays out of the client bundle. Interactive parts move to a
  client content component.
- Within an `aside` prop, static asides come first, then asides that load data, wrapped so they
  stream sequentially, and the footer last.
- Activity-gated asides nudge until the user completes an action, then hide themselves.

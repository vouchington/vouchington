# Sidebar

The sidebar's items, visibility, and ordering are read from `web/components/app-sidebar`. This page
records the rules behind them.

## Section ordering

Sections follow the user journey: discover, engage, contribute, share. Universal discovery is always
visible; creation tools are for authenticated users only; reference and taxonomy are lower-frequency
targets; analytics, content management, and engineering sections are for administrators and the
specific roles that need them.

## Link stability rule

Sidebar link `href` values must not change between user types. A label that appears for several auth
states must always point to the same URL. Gate links with show/hide by auth state; never re-route the
same label to a different destination. This keeps navigation predictable when users log in or out.

## Related

- [Navigation](NAVIGATION.md)
- [Web rules](../../../web/AGENTS.md)

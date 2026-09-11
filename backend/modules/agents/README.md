# Agent module

Defines stable cursor scopes shared by agent services and cross-client API fixtures. Scope values
bind opaque cursors to the normalized resource, filters, and ordering that created them so they
cannot be replayed against a different agent list or conversation.

See [Cross-Surface Cursor Pagination](../../../docs/overview/architecture/pagination.md) for the
canonical cursor contract.

# Media Delivery Safety

This service provides fail-closed publication helpers for media routes whose ownership rows are
about to change or disappear. Callers publish the current immutable placement tuple as withheld
before mutating its owning user, topic, community, or profile-link row.

The helper stages a generation-checked delivery-registry record in the caller's PostgreSQL
transaction, publishes the denial to the edge registry, invalidates the exact CloudFront route,
and marks only that generation complete. Provider failures reject the caller transaction. A later
database failure can leave an extra denial at the edge, but can never expose content that the
database intended to withhold.

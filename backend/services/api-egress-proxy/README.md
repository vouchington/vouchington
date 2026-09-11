# API egress proxy configuration

This service exposes the `api-egress-proxy` DynamicConfig namespace and installs its resolver in
the API process. Each supported provider has an independent `_enabled` flag, allowing staging to
compare direct and proxied requests without changing unrelated integrations.

Flags default on in deployed environments and off in local development and tests. The Squid
sidecar remains running regardless of flag state; flags only choose the transport for each API
request.

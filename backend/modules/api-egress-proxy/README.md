# API egress proxy transport

This module owns API-process outbound routing for providers that may require IPv4 egress. It
selects either the normal external dispatcher or the internal HTTP CONNECT proxy at request time,
so DynamicConfig changes apply without restarting provider SDK clients.

Only the API entrypoint installs a routing resolver. Workers therefore continue to use their
direct public-subnet egress. Enabled proxy requests fail closed when `API_EGRESS_PROXY_URL` is
missing or invalid; deployed environments require the Service Connect endpoint
`http://api-egress-proxy:3128/`.

Provider integrations must request a dispatcher or fetch function explicitly. Do not set a
process-wide `HTTP_PROXY` or `HTTPS_PROXY` variable.

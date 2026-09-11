# GET /api/v1/hostnames/:id

[Back to Hostnames API](README.md#get-apiv1hostnamesid)

Returns the hostname record plus all crawlers associated with it.

Non-admin users receive a 404 for blocked hostnames.

Response: `{ hostname, crawlers: [...], hostname_election: {...} }`

The `hostname` entity excludes raw vote aggregate fields for all viewers, including admins. Vote
counts live in the `hostname_election` sidecar.

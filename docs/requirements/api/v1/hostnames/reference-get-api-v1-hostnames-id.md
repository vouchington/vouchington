# GET /api/v1/hostnames/:id

[Back to Hostnames API](../../../../../backend/api/v1/hostnames/README.md#get-apiv1hostnamesid)

Returns the hostname record plus all crawlers associated with it.

Non-admin users receive a 404 for blocked hostnames and private email-only hostname identities.
Administrators can inspect both.

Response: `{ hostname, crawlers: [...], hostname_election: {...} }`

The `hostname` entity excludes raw vote aggregate fields for all viewers, including admins. Vote
counts live in the `hostname_election` sidecar.

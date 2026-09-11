# Enable

[Back to Private Docs Site](private-docs-site.md)

Private documentation deployment is owned by `vouchington-infra`. Enable its receiver and provider
configuration there, then run the receiver's manual workflow with the Filaments repository and
exact source revision. Future matching Filaments pushes dispatch source revisions automatically.
Filaments stores no destination identifiers or provider credentials for these deployments.

Verify the matching private receiver runs and their provider smoke checks. A successful Filaments
dispatch alone is not deployment evidence.

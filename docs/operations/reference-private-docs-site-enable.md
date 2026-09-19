# Enable

[Back to Private Docs Site](private-docs-site.md)

Private documentation deployment is owned by `vouchington-infra`. Enable its receiver and provider
configuration there, then run the receiver's manual workflow with the Vouchington repository and
exact source revision. Future matching Vouchington pushes dispatch source revisions automatically.
Vouchington stores no destination identifiers or provider credentials for these deployments.

Verify the matching private receiver runs and their provider smoke checks. A successful Vouchington
dispatch alone is not deployment evidence.

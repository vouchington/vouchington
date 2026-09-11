# Disable

[Back to Private Docs Site](private-docs-site.md)

Disable private documentation publication and remove its provider configuration in
`vouchington-infra`. Filaments only dispatches source revisions and has no provider deployment path
to disable.

After the private change, run the private repository's teardown verification and confirm that no
receiver invocation can publish the disabled surfaces.

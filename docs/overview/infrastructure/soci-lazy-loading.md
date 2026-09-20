# SOCI lazy loading

[Back to Infrastructure](README.md)

SOCI indexes reduce Fargate image-start latency by lazily loading container layers. The CloudFormation
stack, vendored template, package lifecycle, and index builder are owned by the private
`vouchington-infra` repository.

Vouchington validates and dispatches source revisions. The private infrastructure repository builds
and publishes immutable ECR image digests and SOCI packages, manages the index builder, and applies
the infrastructure stack. Update that repository for SOCI upgrades, operational procedures, or cost
and provisioning changes.

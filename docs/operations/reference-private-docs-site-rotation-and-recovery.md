# Rotation and recovery

[Back to Private Internal Reference Sites](private-docs-site.md#rotation-and-recovery)

- Basic Auth: add the replacement pair alongside the old pair in the password-manager list. Use the
  private `vouchington-infra` operator-controlled procedure to rotate the encrypted docs and Pages
  bindings, republish the affected trusted surfaces, revoke deployments retaining the retired
  binding snapshot, and verify the new pair succeeds while the old pair fails everywhere. Never
  deploy PR content to Pages.
- R2 and Pages tokens: rotate in Cloudflare, update only their corresponding
  `vouchington-infra` repository secrets, and rerun the affected publisher.
- Plan passphrase: rotate only when no global plan is waiting for approval. An existing encrypted
  artifact requires the old passphrase. After rotation, use the private `vouchington-infra`
  repository's operator-controlled procedure to create and inspect a fresh saved plan, then obtain
  separate authorization for that exact plan before applying it. The global CI apply workflow and
  its trust remain disabled.
- Apply failure: discard the failed saved plan. Use the same operator-controlled procedure to
  create and inspect a fresh saved plan, and obtain separate authorization for that exact plan.
  Never reuse an earlier approval or treat a merge or prior attempt as apply authorization.
- Emergency lockout: use the private `vouchington-infra` operator-controlled emergency procedure
  to invalidate the docs and Pages bindings, publish protected tombstones where applicable, and
  revoke every affected immutable deployment. That procedure owns provider recovery if an unsafe
  or unprotected deployment cannot be contained immediately. Do not make either origin public.
- Storybook publisher verification and provider recovery are owned by the private
  `vouchington-infra` operator-controlled procedure. It must prevent an unsafe or unprotected
  deployment from remaining reachable and restore only protected trusted surfaces before publishing
  resumes.

Pages bindings take effect on new deployments, so changing a secret without republishing every
active and immutable deployment is not a complete revocation.

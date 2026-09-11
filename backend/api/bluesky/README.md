# Bluesky Client Metadata

Anonymous, public AT Protocol client-identification document for Phase D of federation: the one
route a Bluesky (or any AT Protocol) authorization server needs to fetch when validating this
app's OAuth `client_id`/`redirect_uris` at authorize time. See
[the architecture doc](../../../docs/overview/architecture/fediverse-federation.md) for the full
phased design. The account-linking OAuth flow itself (`POST`/`GET`/`DELETE
/api/v1/auth/bluesky/*`) lives in [`../v1/auth/README.md`](../v1/auth/README.md), alongside the
other provider-based OAuth routes — this directory holds only the metadata document the SDK
requires to exist at a fixed, well-known path.

## Endpoints

- `GET /client-metadata.json`
  - Serves `getBlueskyClientMetadata()` (`@modules/bluesky-oauth`) as `application/json`. This URL
    **is** this app's OAuth `client_id` — `@atproto/oauth-client-node` fetches it directly from the
    authorization server, so it carries no Voucha session and intentionally skips
    `response-helpers.mts`'s session-auth preamble, mirroring
    `backend/api/activitypub/webfinger.mts` and `nodeinfo.mts`.

## Performance

- **`GET /client-metadata.json`**: no DB or Valkey calls — a static, in-process-computed discovery
  document. Sets the standard short public cache header.

## Related

- Account linking: [../v1/auth/README.md](../v1/auth/README.md)
- `@modules/bluesky-oauth`: [../../modules/bluesky-oauth/README.md](../../modules/bluesky-oauth/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)

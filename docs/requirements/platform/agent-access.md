# Agent Access

How Voucha steers AI agents to its API and MCP server instead of the website.

## Principle

- **Agents can't be blocked.** An agent that can't find an API automates the website in a browser
  instead.
- **Browser automation is the worst path.** It costs more for everyone, because it renders full
  pages, runs scripts and loads bot mitigation. It also hides the fact that an agent acted, so
  neither Voucha nor other users can tell.
- **So make the API and MCP the easiest path, and show users when it was used.**
  - Discovery documents name the MCP server and how to authenticate to it.
  - Content created through the API or MCP carries
    [provenance](../content/content-provenance.md) that other users can see
    ([#237](https://github.com/vouchington/vouchington/issues/237)).

## Discovery

- These documents advertise the user MCP server and the API-key settings page:
  - `/llms.txt` and `/llms-full.txt`
  - `/.well-known/api-catalog`
  - `/.well-known/agent-card.json` and `/.well-known/agent-skills.json`
- `ADVERTISED_AGENT_INTERFACE_PATHS` in
  [`@ts-shared/route-classification`](../../../ts-shared/route-classification/agent-interfaces.mts)
  lists every authenticated path that public discovery may name.
- [`agent-interface-documents.mts`](../../../cloudflare-worker/src/agent-interface-documents.mts)
  owns the Agent Access text and the JSON entries.
- An advertised path stays a private route:
  - Pages at that path never carry discovery `Link` headers.
  - `robots.txt` and traffic advice keep disallowing it. Crawl rules apply to indexing crawlers,
    not to authenticated requests.
- Tools are discovered by calling `tools/list` with a user MCP key. Public discovery does not link
  the MCP catalog page on the docs site, because that page requires Basic Auth.
- The admin MCP server never appears in public discovery. Staff docs own it, in the
  [admin API README](../../../backend/api/v1/admin/README.md#mcp-clients).
- Discovery documents never contain credentials or URLs that carry credentials.

## Adding an Advertised Interface

- Only an interface that is built for agents and authenticated by the user's own credential
  qualifies.
- To advertise one, add its exact path to `ADVERTISED_AGENT_INTERFACE_PATHS`. Tests then check that:
  - each path is still classified private
  - the allowlist has exactly the expected entries
  - every discovery document is free of private strings once the exact allowlisted URLs are
    removed from it

## Related

- [SEO machine-readable discovery](../seo/SEO.md#machine-readable-discovery)
- [Website specifications](../seo/WEBSITE-SPECIFICATIONS.md#agent-and-machine-discovery)
- [MCP server API](../../../backend/api/v1/mcp/README.md)
- [API keys](../users/api-keys.md)

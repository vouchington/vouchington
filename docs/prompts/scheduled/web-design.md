Do a web design audit. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

Start the managed local stack with `./dev/initialize web` followed by `./dev/tmux`; do not start
individual services as an agent fallback. Inspect the affected route in Chrome or Playwright after
the change. If managed-stack recovery still leaves live browser QA unavailable, stop without
publishing a UI PR.

- Frontend Design: review the relevant pages via Chrome or Playwright MCP. Take screenshots when changing frontend UI.
- Frontend Code Review: any design that is duplicated that we can make more DRY? Any inconsistent layouts or things that should be more consistent?
- Frontend UX: review the flows and journeys. Any gaps? Any improvements that can be made?
- Frontend Patterns: any code not following patterns?
- Reusable layouts: pages should compose shared shells — `PageWithAside` (1200px `ContentContainer`), `AdminPageHeader`/`AdminTableShell` for admin list pages, `SettingsPageHeader` for `/my/*` settings pages. Flag any page that re-implements these from scratch instead of composing them.
- Consistent navigation: sidebar, top-bar search, and per-entity detail menubars should follow the documented patterns in [SIDEBAR.md](../../../docs/requirements/navigation/SIDEBAR.md), [TOPBAR-SEARCH.md](../../../docs/requirements/navigation/TOPBAR-SEARCH.md), and the entity "Detail Menubar" sections. Flag divergent or one-off navigation bars.
- Design-system styles: use shadcn/ui components and Tailwind design tokens throughout; flag ad-hoc colors, spacing, or typography and duplicated style clusters that should become a shared component variant. See [COMPONENTS.md](../../../docs/requirements/navigation/COMPONENTS.md).

Prepare and validate the selected fix, publish it as a draft PR, and reference screenshots when the change affects visible UI. Report these independently:

- `Visual verification:` live affected-route result.
- `Automated browser tests:` result when applicable.
- `Screenshot attachment:` result. Missing upload credentials block attachment only; they do not
  replace or block local visual verification.

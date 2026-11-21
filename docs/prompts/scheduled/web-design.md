Do a web design audit. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Start the managed stack with `./dev/initialize web` then `./dev/tmux`, and inspect the affected route in Chrome or Playwright after the change. If live browser QA stays unavailable after recovery, stop without publishing a UI PR. Screenshots are required for UI changes.

- Design, UX, and code: review pages and flows for gaps, inconsistent or duplicated layouts, and code not following established patterns.
- Reusable layouts: pages compose shared shells (`PageWithAside`, `AdminPageHeader`/`AdminTableShell`, `SettingsPageHeader`); flag pages that re-implement them.
- Navigation: sidebar, top-bar search, and entity detail menubars follow [SIDEBAR.md](../../requirements/navigation/SIDEBAR.md), [TOPBAR-SEARCH.md](../../requirements/navigation/TOPBAR-SEARCH.md), and the entity "Detail Menubar" sections; flag one-offs.
- Styles: shadcn/ui components and Tailwind tokens throughout ([COMPONENTS.md](../../requirements/navigation/COMPONENTS.md)); flag ad-hoc colors, spacing, typography, and duplicated style clusters that should be a variant.

Report independently: `Visual verification:` (live affected-route result), `Automated browser tests:` (when applicable), and `Screenshot attachment:` (missing upload credentials block only the attachment, not local verification).

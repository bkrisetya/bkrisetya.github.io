# Substack Homepage Integration Design

**Date:** 2026-03-13
**Status:** Draft
**Repo:** `bkrisetya/bkrisetya.github.io`

## Context

krisetya.com is a Hugo static site (Congo theme) deployed via GitHub Pages. The site serves as a professional "credibility engine" for academic, policy, and civil society audiences. The owner writes monthly on Substack at `idea.krisetya.com` ("(Stray) Ideas") — a mix of reflective essays and research/work updates.

Currently, the site has no indication that the owner writes. Visitors to krisetya.com would not discover the Substack unless they find it independently.

### Content pipeline

```
Brainstorm (OpenClaw / Claude Code)
    │
    ▼
Draft on Write.as (journal.krisetya.com) — unlisted
    │
    ▼
Share link with selected audience → gather feedback
    │
    ▼
Revise in Obsidian
    │
    ▼
Manually post on Substack (idea.krisetya.com)
    │
    ▼
Daily Hugo rebuild picks up RSS → appears on krisetya.com homepage
```

Write.as (`journal.krisetya.com`) serves as the drafting/feedback platform. Posts are unlisted by default (free tier) — only people with the direct link can read them. After feedback and revision, the polished version is manually published on Substack. This spec covers only the final stage: displaying Substack posts on krisetya.com.

### Goal

Surface recent Substack posts on the krisetya.com homepage so that all target audiences (academics, policy practitioners, civil society, employers/fellowship panels, early-career peers) can discover the writing without leaving the professional domain first.

### Prior decisions (from 2026-03-07 sm-pi session)

- Hugo + Congo theme (already implemented and live)
- GitHub Pages via GitHub Actions (already implemented)
- Audience-split nav: `Home | Research | Policy | About | Contact`
- Serif headings (Source Serif 4) + sans body (Inter)
- Problem-first positioning statement on homepage

## Design

### Architecture

```
Substack (idea.krisetya.com)
    │
    ▼
RSS feed (idea.krisetya.com/feed)
    │
    ▼
Hugo build (GitHub Actions)
  └─ resources.GetRemote fetches RSS at build time
  └─ XML unmarshaled, rendered as styled cards
    │
    ▼
krisetya.com homepage
  └─ "Latest Writing" section below hero
  └─ Each post links out to Substack
```

### What changes

| Component | File | Change |
|-----------|------|--------|
| Substack feed partial | `layouts/partials/substack-feed.html` | New. Fetches RSS, parses XML, renders post list |
| Homepage layout | `layouts/partials/home/custom.html` | Append `{{ partial "substack-feed.html" . }}` below existing hero `</article>` |
| Hugo config (security) | `hugo.toml` | Add `[security.http]` to whitelist Substack feed URL |
| Hugo config (params) | `config/_default/params.toml` | Add `[substackFeed]` params (url, limit) |
| GitHub Actions | `.github/workflows/gh-pages.yml` | Add `schedule: cron` trigger for daily rebuild |

### What does NOT change

- Navigation: stays `Home | Research | Policy | About | Contact` (no "Writing" link)
- Existing pages (Research, Policy, About, Contact): untouched
- No new content pages (no `/writing/` page)
- No Substack-to-Hugo content migration
- Write.as (`journal.krisetya.com`) stays as draft/feedback platform — NOT being sunset

### Homepage layout (updated)

```
┌─────────────────────────────────────────────┐
│  [Profile photo]                            │
│  Beltsazar Krisetya                         │
│  [Positioning statement]                    │
│  [Social icons]                             │
│  [Research] [Policy] [Contact]              │
│                                             │
│  ── Latest Writing ──────────────────────── │
│                                             │
│  Title of Post 1                            │
│  First ~150 chars of description...         │
│  Mar 2026                                   │
│                                             │
│  Title of Post 2                            │
│  First ~150 chars of description...         │
│  May 2025                                   │
│                                             │
│  → Read more on Substack                    │
└─────────────────────────────────────────────┘
```

- Shows latest 3 posts (configurable via `params.toml`)
- Each post: title (linked to Substack), excerpt, date
- "Read more on Substack" CTA at bottom links to `idea.krisetya.com`
- Styled to match existing site: Source Serif 4 for headings, Inter for body, slate color scheme, existing border/card patterns
- If zero posts returned or feed unavailable: entire section is hidden

### Partial: `layouts/partials/substack-feed.html`

**Note:** This is a partial, not a shortcode. Hugo shortcodes can only be invoked from content files (Markdown), not from template partials. Since the homepage uses a custom layout partial (`custom.html`), the feed component must also be a partial.

**Configuration (via `config/_default/params.toml`):**

```toml
[substackFeed]
  url = "https://idea.krisetya.com/feed"
  limit = 3
```

**Behavior:**
1. Read `url` and `limit` from `.Site.Params.substackFeed`
2. Fetch RSS via `resources.GetRemote`
3. Unmarshal XML via `transform.Unmarshal`
4. Iterate over `<item>` elements up to `limit`
5. Extract: `<title>`, `<description>` (strip HTML via `plainify`, truncate to ~150 chars), `<pubDate>`, `<link>`
6. Render as styled list matching existing card patterns

**Field choice:** Use `<description>` (short excerpt), not `<content:encoded>` (full HTML). The `content:encoded` field uses an XML namespace that requires special handling and contains full post HTML — overkill for a preview card.

**Error handling:**
- If fetch fails (network error, Substack down): section is silently omitted. Build does NOT fail.
- If feed returns valid XML with zero `<item>` elements: section is hidden entirely (no empty heading).
- Use `with` guards around `resources.GetRemote` to handle nil responses gracefully.

**Dependency:** If `idea.krisetya.com` is renamed or the custom domain removed, the feed URL changes and the section silently disappears (per error handling). This is acceptable — the rest of the site renders normally.

### Hugo config additions

**`hugo.toml` — security policy (required for `resources.GetRemote` since Hugo 0.91+):**

```toml
[security]
  [security.http]
    urls = ['https://idea\.krisetya\.com/.*']
    methods = ['(?i)GET']
```

Without this, `resources.GetRemote` will fail with a whitelist error. The pattern is restricted to the Substack feed domain only.

**`config/_default/params.toml` — feed configuration:**

```toml
[substackFeed]
  url = "https://idea.krisetya.com/feed"
  limit = 3
```

**Note on `[mediaTypes]`:** Testing needed to determine if Substack's `application/xml` Content-Type causes issues with `transform.Unmarshal`. If it does, add to `hugo.toml`:

```toml
[mediaTypes."application/xml"]
  suffixes = ["rss"]
```

Otherwise, omit to keep config minimal.

### GitHub Actions: daily scheduled rebuild

The existing `.github/workflows/gh-pages.yml` already handles push-triggered builds. Add a schedule trigger:

```yaml
on:
  push:
    branches:
      - master
  schedule:
    - cron: '0 6 * * *'  # daily at 06:00 UTC
```

This ensures new Substack posts appear on krisetya.com within 24 hours of publishing, with no manual intervention. The cron job runs the same build-deploy pipeline.

### Styling

The feed section will use:
- Existing `expertise-card` border pattern for post items (or similar light-border cards)
- Source Serif 4 for post titles
- Inter for excerpts and dates
- `text-neutral-600` / `dark:text-neutral-400` for secondary text
- Dark mode support using existing `.dark` class patterns
- No new CSS classes unless strictly necessary; prefer existing Tailwind utility classes

### Testing plan

1. Run `hugo server` locally after adding partial; verify feed renders with real Substack data
2. Verify graceful degradation: temporarily use a broken URL, confirm site builds without the section
3. Verify zero-posts edge case: use a feed URL that returns valid XML with no items; confirm section is hidden entirely
4. Verify `security.http` config: remove it temporarily, confirm build fails with whitelist error (validates the config is necessary)
5. Verify daily cron triggers in GitHub Actions (check Actions tab after 24h)
6. Verify links point to correct Substack posts
7. Verify dark mode rendering
8. Verify mobile responsiveness (the existing layout is already responsive via Tailwind flex)
9. Verify excerpt rendering: check that HTML is stripped and text is cleanly truncated

### Future work (out of scope)

- Migrate "On Positionality" from Write.as to Substack (after pipeline is tested)
- Substack newsletter branding/positioning refinement
- Possible `/writing/` page if post volume increases
- Post ideation workflow tooling (OpenClaw/Claude Code templates)

# Copilot Instructions for Academic Pages Website

This is a Jekyll-based academic portfolio website using the [Academic Pages template](https://github.com/academicpages/academicpages.github.io), forked from Minimal Mistakes. It's hosted on GitHub Pages and automatically rebuilds on every commit.

## Local Development

### Running the site locally

**Standard approach:**
```bash
bundle install
jekyll serve -l -H localhost
# or
bundle exec jekyll serve -l -H localhost
```
Site will be available at `http://localhost:4000`

**Using Docker:**
```bash
chmod -R 777 .
docker compose up
```

**Using VS Code DevContainer:**
Press F1 → "Dev Containers: Reopen in Container"

### Important notes
- Jekyll does NOT auto-reload when `_config.yml` is changed - restart the server
- Changes to `.md` and HTML files reload automatically with `-l` flag
- The Docker config uses `_config_docker.yml` instead of `_config.yml`

## Build Commands

This project uses npm for JavaScript minification:

```bash
# Build minified JavaScript bundle
npm run build:js

# Watch for changes and rebuild automatically  
npm run watch:js
```

The build process combines jQuery, FitVids, smooth-scroll, Plotly, and custom JS files into `assets/js/main.min.js`.

## Architecture

### Content Collections
The site uses Jekyll collections to organize different content types. Each collection lives in its own directory:

- `_publications/` - Research papers (sorted into categories: books, manuscripts, conferences)
- `_talks/` - Conference presentations and talks
- `_teaching/` - Teaching experience entries
- `_portfolio/` - Project portfolio items
- `_posts/` - Blog posts

### Layouts & Includes
- `_layouts/` - Page templates (single, talk, etc.)
- `_includes/` - Reusable components (author-profile.html, navigation, etc.)
- `_sass/` - SCSS stylesheets compiled to CSS
- `_pages/` - Top-level pages like About, CV, etc.

### Configuration
- `_config.yml` - Main Jekyll config with site metadata, author info, and social links
- `_data/navigation.yml` - Site navigation menu structure
- `_data/ui-text.yml` - UI text strings for internationalization
- `_data/cv.json` - Structured CV data for JSON-LD output

### Content Generation
The `markdown_generator/` directory contains Python scripts and Jupyter notebooks to generate markdown files from TSV data:

- `publications.py` / `publications.ipynb` - Generate `_publications/*.md` from `publications.tsv`
- `talks.py` / `talks.ipynb` - Generate `_talks/*.md` from `talks.tsv`
- `PubsFromBib.ipynb` - Import publications from BibTeX files
- `OrcidToBib.ipynb` - Fetch publications from ORCID

Use these when you need to bulk-add or update publications/talks rather than editing individual markdown files.

## Key Conventions

### Front Matter Structure

**Publications** require these fields:
```yaml
---
title: "Paper Title"
collection: publications
category: conferences  # or manuscripts, books
permalink: /publication/YYYY-MM-DD-slug
excerpt: 'Brief description'
date: YYYY-MM-DD
venue: 'Conference or Journal Name'
paperurl: 'https://doi.org/...'
citation: 'Author list. (Year). "Title." <i>Venue</i>.'
---
```

**Talks** require:
```yaml
---
title: "Talk Title"
collection: talks
type: "Talk"  # or "Tutorial", "Conference proceedings talk"
permalink: /talks/YYYY-MM-DD-slug
venue: "Institution or Conference"
date: YYYY-MM-DD
location: "City, Country"
---
```

### File Naming
- Publications: `_publications/YYYY-MM-DD-slug.md` (date determines sort order)
- Talks: `_talks/YYYY-MM-DD-slug.md`
- Blog posts: `_posts/YYYY-MM-DD-title.md`

### Permalink Convention
All permalinks follow the pattern: `/{collection}/{filename-without-extension}`

## Theme Customization

This site uses the "default" theme variant (configurable via `site_theme` in `_config.yml`). The "air" theme is also available as an alternative.

To customize the author profile sidebar, edit `_includes/author-profile.html`. The displayed social links are controlled by the `author:` section in `_config.yml` - empty fields are automatically hidden.

## GitHub Pages Compatibility

The site uses only GitHub Pages-compatible plugins (whitelisted in `_config.yml`):
- jekyll-feed
- jekyll-sitemap
- jekyll-redirect-from
- jemoji
- jekyll-paginate
- jekyll-gist

Changes pushed to the repository automatically trigger a rebuild and deploy through GitHub Actions.

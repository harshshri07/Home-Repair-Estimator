# Spark Repair Estimator

Mobile-first Progressive Web App for Spark Homes acquisition agents to estimate repair costs during on-site property walkthroughs.

## Quick Start (Windows PowerShell)

```powershell
cd "c:\Users\shris\OneDrive\Desktop\Spark web Application\spark-estimator"
python -m http.server 8765
```

Open **http://localhost:8765** in Chrome (Android) or Safari (iOS). For PWA install and offline mode, use HTTPS or localhost — not `file://`.

## Approach

- **Vanilla ES modules** — no build step, no framework. HTML + CSS + modular JavaScript.
- **Data layer** — `store.js` persists projects in `localStorage`; `catalog.js` loads official prices from `data/prices.json` (sourced from Pricing List.csv).
- **Scope model** — house-wide sections (Interior/General, Systems, Exterior) plus configurable room instances (Kitchen, Bathroom, Bedroom, Living/Common). Each room gets its own repair groups.
- **Pricing** — global overrides via Settings CSV upload; per-project overrides on any line item. Custom items can be added per group; catalog items can be hidden per project.
- **Export** — SheetJS (`xlsx-js-style`) + JSZip produce a ZIP with Excel breakdown and photos.

## Libraries (CDN)

| Library | Purpose |
|---------|---------|
| [xlsx-js-style](https://www.npmjs.com/package/xlsx-js-style) | Styled Excel export |
| [JSZip](https://stuk.github.io/jszip/) | ZIP packaging for export |

## PWA / Offline

- `manifest.json` — standalone display, Spark branding icons
- `sw.js` — caches static assets and CDN libraries on first load
- Works offline after initial visit; all project data in localStorage

## Install on Phone

**Android (Chrome):** Menu → *Install app* or *Add to Home screen*

**iOS (Safari):** Share → *Add to Home Screen*

## Creative Feature: Deal Profit Analyzer

Tap **$** in the header to open ARV, offer price, and holding cost inputs. Shows all-in cost, gross profit, and margin with color-coded deal quality (green ≥15%, yellow 8–15%, red <8%).

## Project Structure

```
spark-estimator/
├── index.html          # App entry
├── css/app.css         # Spark-branded mobile UI
├── js/
│   ├── app.js          # Boot
│   ├── catalog.js      # Price list + 19 repair groups
│   ├── store.js        # Projects & persistence
│   ├── calc.js         # Totals & progress
│   ├── ui.js           # Render & events
│   ├── export.js       # Excel + ZIP
│   ├── deal.js         # Deal Profit Analyzer
│   └── pwa.js          # Service worker registration
├── data/prices.json    # Official price list
├── manifest.json
├── sw.js
└── assets/logo.png
```

## AI Tools

Built with Cursor AI assistance for architecture, module scaffolding, and UI implementation. All design decisions, room model, and Deal Analyzer feature were specified in the project plan; AI accelerated coding velocity.

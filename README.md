# Amazon PPC Campaign Tracker (Local)

A browser-based local tool to track Amazon PPC campaigns, keyword sheets, reminders, and optimization history.

## Features
- ClickUp/Asana-inspired board layout with a retro-computer visual style.
- Campaign fields: campaign name, created date, ad type, match type, category, model ASIN list, budget, placements.
- Keyword Tab opens an Excel-style popup (one keyword per line).
- Auto optimization reminder based on creation date + reminder days.
- Edit existing campaigns.
- Add repeated optimization dates; history is stored and displayed.
- Local storage persistence (no backend required).

## Run locally
1. Open `index.html` directly in a browser, or
2. Serve locally:
   ```bash
   python3 -m http.server 8000
   ```
   then open `http://localhost:8000`.

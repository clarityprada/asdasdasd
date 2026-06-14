# ClarityPrada Extension — Visual Revamp + Rename

## Original problem statement
1. "I want to completely revamp the look of my extension leaving all of my original code intact only changing visuals."
2. "Change everything that says pascha to clarityprada."

## Source
GitHub: https://github.com/clarityprada/asdasdasd (originally "Pascha" Chrome MV3 extension — TikTok video patcher)

## Design direction (user reference)
- Dark modern minimal aesthetic with purple accents
- Inspired by ClarityPrada reference image (deep blacks, glowing red-on-purple eye motif, "CLARITY**PRADA**" wordmark with PRADA in purple, dashed cloud dropzone, big purple CTA, status pill, SILENT/PRECISE/PRIVATE pillar footer)

## What's been implemented (2026-01)

### Visual revamp (popup.html)
- Outfit + JetBrains Mono fonts
- Layered radial-gradient background with subtle noise grain
- Branded header: chevron mark + gradient "CLARITY**PRADA**" wordmark + pulsing live dot
- Hero panel: central red-on-purple glowing eye motif, "CLARITY**PRADA**" wordmark, "SILENT · SHARP · CLARITY" tag
- Animated dashed dropzone (transitions to solid purple via `body.has-file` hook)
- Cloud-upload SVG icon with glow
- Gradient purple PATCH button with shimmer sweep, hover lift, animated arrow
- Status bar styled by `data-state` (idle / processing / success / error) with colored dot indicators
- 3-pillar footer: SILENT / PRECISE / PRIVATE
- Re-styled file size warning modal with backdrop blur

### Rename Pascha → ClarityPrada (all files)
- `manifest.json`: name, description, default_title
- `popup.js`: COPY.title, buildClarityPradaPatch fn, filename suffix `_clarityprada_patched.mp4`
- `inject.js`: window globals `__clarityPradaAlwaysOnBypassInstalled`, `__clarityPradaBypassAlwaysOn`
- `popup.html`: header h1, hero wordmark, aria-label
- `README.txt`: install instructions
- All core MP4-patch logic, video parsing, fake-sample construction, TikTok bypass logic unchanged
- Verified: `grep -nir pascha /app/extension` returns ZERO matches

## Install
- Folder: `/app/extension/` — Chrome → `chrome://extensions` → Developer mode → Load unpacked
- Packaged zip: `/app/clarityprada.zip`

## Future / Backlog
- P2 — Show selected filename inside the dropzone itself (not just status bar). ~2 lines in popup.js.
- P2 — Success toast micro-animation on patch completion.
- P2 — Localized copy via Chrome i18n APIs (data-i18n hooks already in place).

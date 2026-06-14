# Pascha Extension — Visual Revamp

## Original problem statement
"I want to completely revamp the look of my extension leaving all of my original code intact only changing visuals."

## Source
GitHub: https://github.com/clarityprada/asdasdasd (Pascha Chrome MV3 extension — TikTok video patcher)

## Constraint
- All JavaScript logic must remain 100% untouched (popup.js, content.js, inject.js, manifest.json)
- Only visual layer (popup.html — markup + CSS) may change
- All element IDs, data-i18n attributes, data-state hook, body.has-file class hook, .cu-warning-body selector must be preserved

## Design direction (user reference)
- Dark modern minimal aesthetic with purple accents
- Inspired by ClarityPrada reference image (deep blacks, glowing purple, anime-eye style hero, spaced wordmark, dashed dropzone, big purple CTA, status pill, 3 pillar footer)

## What's been implemented (2026-01)
- Rewrote `/app/extension/popup.html` only
  - Outfit + JetBrains Mono fonts
  - Layered radial-gradient background with subtle noise grain
  - Branded header (V-shaped chevron mark + gradient PASCHA wordmark + pulsing live dot)
  - Hero panel with central red-on-purple glowing eye motif, "PAS**CHA**" wordmark and "SILENT · SHARP · PATCHED" tagline
  - Animated dashed dropzone (transitions to solid purple border via `body.has-file` hook)
  - Cloud-upload SVG icon with glow
  - Big gradient purple PATCH button with shimmer sweep, hover lift, animated arrow
  - Status bar styled by `data-state` (idle / processing / success / error) — each with distinct color and dot indicator
  - Bottom 3-pillar row: SILENT / PRECISE / PRIVATE
  - Re-styled file size warning modal: backdrop blur, red kicker pill, dark surface card
- Zero changes to popup.js, content.js, inject.js, manifest.json (verified via diff)
- Packaged: `/app/pascha_revamped.zip` (loadable via Chrome → chrome://extensions → Load unpacked → /app/extension)

## Future / Backlog (suggestions)
- P2: Show selected filename inside the dropzone (currently shows in status bar). Would require a 2-line addition in popup.js.
- P2: Add success/error toast micro-animation on patch complete.
- P2: Localized copy via Chrome i18n APIs (extension already has data-i18n hooks).

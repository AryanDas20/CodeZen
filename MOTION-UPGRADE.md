# BrandWeave Motion Upgrade

This update keeps the original BrandWeave palette and adds a motion-only visual layer.

## Palette preserved

The original theme stylesheet is unchanged. The motion layer uses the existing CSS theme variables (`--olive`, `--sand-i`, `--grey-i`, `--ink`, `--panel`, and related values) and the supplied brand swatch colours for the canvas particles. It does not replace the light or dark theme colours.

## Added motion

- Animated dotted grid and a connected particle network in the background.
- Floating ambient colour blooms, rotating outlined geometry, orbit rings, a dotted square, and a slow moving accent line.
- Cursor-responsive particle attraction and a soft cursor glow on fine-pointer devices.
- Thin scroll-progress indicator.
- Staggered scroll reveals for landing-page sections and dynamically rendered workspace cards.
- Gentle pointer tilt on selected cards, animated dashboard hero sheen, and floating/rotating hero accents.
- Animated button highlight sweeps, status pulses, and small navigation/card interactions.

## Performance and accessibility

- Canvas particle count is adaptive and capped according to viewport size, pointer type, and available hardware concurrency.
- Desktop canvas motion is capped at 42 FPS; touch layouts are capped at 30 FPS.
- Canvas work pauses when the document is hidden.
- Most decorative CSS motion uses `transform`, `opacity`, `rotate`, `scale`, and `translate` rather than layout-affecting properties.
- Mobile layouts reduce particle density and hide several decorative objects.
- `prefers-reduced-motion: reduce` disables animated effects and leaves content visible.
- No additional npm dependencies were added.

## Files changed

- `public/index.html`: includes the motion stylesheet and motion script.
- `public/motion.css`: motion and background styling, using the original theme variables.
- `public/ambient-motion.js`: adaptive canvas particles, scroll progress, reveal observer, and pointer interactions.

Application logic, Firebase client code, server code, dependencies, and the original `styles.css` / `theme.css` are unchanged.

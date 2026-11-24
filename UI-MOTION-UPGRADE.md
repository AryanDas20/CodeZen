# BrandWeave UI & Motion Upgrade

This upgrade layers a lightweight interaction system onto the existing BrandWeave product without replacing its authentication, API, Firebase, review, approval, audit, or AI workflows.

## Visual upgrades
- Animated landing-page entrance, ambient background orbs, polished hover states, and staggered dashboard entrances.
- Consistent easing and short transform/opacity-based transitions across cards, navigation, buttons, dialogs, toasts, and the AI drawer.
- Scroll-triggered reveal animations for landing sections and dynamically rendered workspace content.
- Pointer-following ambient light, scroll progress indicator, and floating back-to-top control.
- Animated AI launcher and status indicators.

## Productivity features
- **Focus mode:** press `Ctrl/⌘ + Shift + F` to hide workspace navigation and give the current page more room.
- **Quick search:** press `Ctrl/⌘ + Shift + K`.
- **AI command centre:** press `Ctrl/⌘ + K` (existing shortcut).
- **Keyboard guide:** press `?` to view shortcuts.
- **Back to top:** appears after scrolling down.

## Performance and accessibility
- Scroll updates are coalesced with `requestAnimationFrame`.
- Scroll reveals use `IntersectionObserver` and stop observing each element after it appears.
- Pointer effects are enabled only for fine pointers and are disabled for reduced-motion preferences.
- `prefers-reduced-motion` is respected across the motion system.
- Animations primarily use opacity and transforms; no animation libraries or new runtime dependencies were added.
- Existing app data and backend flows are unchanged.

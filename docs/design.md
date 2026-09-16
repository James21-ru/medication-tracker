# Design direction

## Intent

The interface should feel calm, reliable, and private. The user opens it to complete one health-related task, not to inspect a dashboard.

## Reference interpretation

Apple Health is used for interaction principles: clear hierarchy, a daily journal, simple status choices, and an unobtrusive visual tone. Product copy, information architecture details, assets, and styling are original.

## Visual rules

- Large page title and a concise date on Today.
- One prominent next-dose card.
- Status never relies only on color: add text and an icon for taken, skipped, and upcoming.
- Use readable type, large touch targets, and no decorative charts in the MVP.
- Give each medication an optional original color and symbol.

## Liquid glass requirement

- Apply glass only to controls: the tab bar, compact filter bar, and modal action area.
- Use translucency and background blur with sufficient contrast.
- Respect Reduce Transparency and Reduce Motion preferences.
- On Android, use an opaque or lightly translucent adaptive surface rather than imitating iOS system chrome.

## First prototype screens

1. Today with an upcoming dose, a completed dose, and a later dose.
2. Dose confirmation sheet: Taken, Skipped, Cancel.
3. Add-medication wizard: name, dose, schedule, reminder, visual identity.

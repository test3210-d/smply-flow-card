# Changelog

## 1.2.1

- Added a global font-size selector from 8 px to 24 px.
- Empty node names are no longer replaced with internal keys or default labels.
- Solar Total, grid entries, consumers, batteries, solar fields, and inverter can render without a title.

## 1.2.0

- Added an independent path-source selector for Consumer 1 and Consumer 2.
- Each consumer can connect either to the inverter output or directly to the center.
- The default consumer route is the inverter output.
- Consumer direction labels now describe source-to-consumer flow explicitly.

## 1.1.1

- Solar Total uses a configured dedicated sensor when available.
- Clicking Solar Total opens the dedicated sensor's Home Assistant history.
- Without a dedicated sensor, Solar Total is calculated from Solar 1 and Solar 2.
- A calculated total has no history action because it is not a Home Assistant entity.

## 1.1.0

- Replaced the custom card editor with native Home Assistant `ha-form` controls.
- Added the standard Home Assistant icon selector with icon search and preview.
- Replaced custom entity fields with native Home Assistant entity selectors.
- Added native dropdown selectors for power-flow directions.
- Active colored flow paths are now exactly twice as thick as inactive paths.

## 1.0.2

- Power values above 1000 W are displayed in kW with two decimal places.
- Power values up to and including 1000 W are displayed as integer watts.
- Active SVG flow paths now use the same color as their moving dot.

## 1.0.1

- Fixed Solar Total click action so Home Assistant opens the entity more-info dialog with history and graph.

## 1.0.0

- Initial HACS-ready release.
- 3×3 power-flow layout.
- Two solar inputs and two batteries.
- Up to three grid entities.
- Separate inverter output.
- Searchable entity selectors.
- Dynamic battery icon and state colors.
- Proportional battery contribution on the inverter-output ring.

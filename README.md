# Simple Power Flow Card

Custom Lovelace card for Home Assistant with a 3×3 power-flow layout.

Repository: https://github.com/test3210-d/smply-flow-card

## Features

- Two solar inputs
- Two batteries
- Up to three grid entities
- Two consumers
- Separate inverter output
- Animated power-flow dots
- Battery charge and discharge sensors
- Dynamic battery icon based on SOC
- Battery circle:
  - green while charging
  - red while discharging
  - green while idle
- Proportional inverter-output ring:
  - red = power supplied by batteries
  - green = remaining inverter output
- Native Home Assistant visual editor based on `ha-form`
- Standard Home Assistant entity and icon selectors
- Searchable entity selectors by entity ID and friendly name
- Optional entities are hidden when not configured

## Installation through HACS

1. Open **HACS**.
2. Open the three-dot menu.
3. Select **Custom repositories**.
4. Add:

   ```text
   https://github.com/test3210-d/smply-flow-card
   ```

5. Select the repository type **Dashboard** (called **Lovelace** in older HACS versions).
6. Find **Simple Power Flow Card** and install it.
7. Reload the browser.

HACS registers the JavaScript resource automatically when Home Assistant uses storage mode for Lovelace dashboards.

The resulting resource URL is normally:

```text
/hacsfiles/smply-flow-card/simple-power-flow-card.js
```

When dashboards are managed entirely in YAML mode, add the resource manually:

```yaml
lovelace:
  resources:
    - url: /hacsfiles/smply-flow-card/simple-power-flow-card.js
      type: module
```

## Add the card

Use the visual dashboard editor or YAML:

```yaml
type: custom:simple-power-flow-card
```

Then configure the required entities in the visual editor.

## Updating

Updates are delivered through HACS after a new GitHub release is published.

## Release procedure

Create and push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The included GitHub Actions workflow creates the GitHub release automatically.

## Manual installation

Copy `simple-power-flow-card.js` to:

```text
/config/www/simple-power-flow-card.js
```

Register it as a JavaScript module:

```text
/local/simple-power-flow-card.js
```

## Development

The distributed card is a single dependency-free JavaScript module. Before publishing, validate it with:

```bash
node --check simple-power-flow-card.js
```

## License

MIT

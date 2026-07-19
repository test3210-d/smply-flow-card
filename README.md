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

## HACS (recommended)

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=test3210-d&repository=smply-flow-card&category=plugin)

Open your Home Assistant instance and add this repository to the Home Assistant Community Store.

After HACS is installed, use the button above. Home Assistant opens HACS and pre-fills this custom dashboard repository:

```text
https://github.com/test3210-d/smply-flow-card
```

Install **Simple Power Flow Card** from HACS and reload the browser. HACS downloads `simple-power-flow-card.js` and automatically registers the dashboard resource when Lovelace uses storage mode.

The resource URL is:

```text
/hacsfiles/smply-flow-card/simple-power-flow-card.js
```

For dashboards managed entirely in YAML mode, add the resource manually:

```yaml
lovelace:
  resources:
    - url: /hacsfiles/smply-flow-card/simple-power-flow-card.js
      type: module
```

> The My Home Assistant button adds this repository as a custom HACS repository. For the card to appear in HACS global search without adding the repository first, the repository must also be submitted to and accepted into the official HACS default repository list.

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

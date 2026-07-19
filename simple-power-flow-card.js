const SIMPLE_POWER_FLOW_CARD_VERSION = "1.2.2";

class SimplePowerFlowCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("simple-power-flow-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._raf = 0;
    this._flowEpoch = performance.now();
  }

  setConfig(config) {
    this._config = config || {};
    this._scheduleRender();
  }

  set hass(hass) {
    this._hass = hass;
    this._scheduleRender();
  }

  getCardSize() {
    return 6;
  }

  _scheduleRender() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  _state(entityId) {
    return entityId && this._hass ? this._hass.states[entityId] : null;
  }

  _num(entityId) {
    const s = this._state(entityId);
    if (!s || ["unknown", "unavailable"].includes(s.state)) return null;
    const n = Number(s.state);
    return Number.isFinite(n) ? n : null;
  }

  _numericPowerWatts(entityId) {
    const state = this._state(entityId);
    if (!state || ["unknown", "unavailable"].includes(state.state)) return null;

    const value = Number(state.state);
    if (!Number.isFinite(value)) return null;

    const unit = String(state.attributes.unit_of_measurement || "").trim().toLowerCase();
    return unit === "kw" ? value * 1000 : value;
  }

  _formatPowerWatts(watts) {
    if (!Number.isFinite(watts)) return "—";
    if (Math.abs(watts) > 1000) return `${(watts / 1000).toFixed(2)} kW`;
    return `${Math.round(watts)} W`;
  }

  _solarTotalData() {
    const entity = this._config?.solar_total?.power;

    // A dedicated sensor always has priority and is used for Home Assistant history.
    if (entity) {
      return {
        entity,
        calculated: false,
        value: this._value(entity, "W")
      };
    }

    // Without a dedicated sensor, calculate the display value from both solar fields.
    const first = this._numericPowerWatts(this._config?.solar1?.power);
    const second = this._numericPowerWatts(this._config?.solar2?.power);

    if (first === null && second === null) {
      return { entity: null, calculated: true, value: "—" };
    }

    return {
      entity: null,
      calculated: true,
      value: this._formatPowerWatts((first || 0) + (second || 0))
    };
  }

  _value(entityId, unitFallback = "") {
    const s = this._state(entityId);
    if (!s || ["unknown", "unavailable"].includes(s.state)) return "—";

    const unit = s.attributes.unit_of_measurement || unitFallback;
    const numeric = Number(s.state);
    const deviceClass = s.attributes.device_class || "";
    const normalizedUnit = String(unit).trim().toLowerCase();
    const isPower = deviceClass === "power" ||
      ["w", "kw", "watt", "watts", "кіловат", "ват"].includes(normalizedUnit);

    if (isPower && Number.isFinite(numeric)) {
      let watts = numeric;

      if (normalizedUnit === "kw" || normalizedUnit === "кіловат") {
        watts = numeric * 1000;
      }

      if (Math.abs(watts) > 1000) {
        return `${(watts / 1000).toFixed(2)} kW`;
      }

      return `${Math.round(watts)} W`;
    }

    return `${s.state}${unit ? ` ${unit}` : ""}`;
  }

  _configured(node, keys) {
    if (!node || !this._hass) return false;
    return keys.some(key => {
      const entityId = node[key];
      return typeof entityId === "string" &&
        entityId.trim() !== "" &&
        !!this._hass.states[entityId];
    });
  }

  _direction(node, key = "power", threshold = 0) {
    const value = this._num(node?.[key]);
    if (value === null || Math.abs(value) <= threshold) return "idle";
    const positive = node?.positive_direction || "to_center";
    const positiveDir = positive === "from_center" ? "out" : "in";
    return value > 0 ? positiveDir : positiveDir === "in" ? "out" : "in";
  }

  _consumerDirection(node, threshold = 10) {
    const value = this._num(node?.power);
    if (value === null || Math.abs(value) <= threshold) return "idle";

    // Consumer paths are defined from the consumer node toward its selected source.
    // "from_source" therefore animates in reverse: source -> consumer.
    const configured = node?.positive_direction;
    const positiveDir = configured
      ? (configured === "from_center" ? "out" : "in")
      : "out";

    return value > 0 ? positiveDir : positiveDir === "in" ? "out" : "in";
  }

  _nodeState(node) {
    const s = this._state(node?.switch || node?.status);
    if (!s) return "neutral";
    if (s.state === "on") return "on";
    if (s.state === "off") return "off";
    if (s.state === "unavailable") return "unavailable";
    return "neutral";
  }

  _toggle(node) {
    if (!node?.switch || !this._hass || this._toggleBusy) return;
    this._toggleBusy = true;
    Promise.resolve(
      this._hass.callService("homeassistant", "toggle", { entity_id: node.switch })
    ).finally(() => setTimeout(() => (this._toggleBusy = false), 350));
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _mainEntity(node, type) {
    if (type === "battery") {
      return node?.soc || node?.charge_power || node?.discharge_power;
    }
    return node?.power || node?.voltage || node?.switch || node?.status;
  }

  _nodeMetrics(type, node) {
    if (type === "solar") {
      return [
        node.voltage ? `<div>${this._value(node.voltage)}</div>` : "",
        node.power ? `<div class="accent">${this._value(node.power)}</div>` : ""
      ].join("");
    }
    if (type === "grid") {
      return [
        node.voltage ? `<div>${this._value(node.voltage)}</div>` : "",
        node.power ? `<div class="import">${this._value(node.power)}</div>` : ""
      ].join("");
    }
    if (type === "battery") {
      return [
        node.soc ? `<div>${this._value(node.soc, "%")}</div>` : "",
        node.charge_power ? `<div class="charge">↓ ${this._value(node.charge_power)}</div>` : "",
        node.discharge_power ? `<div class="discharge">↑ ${this._value(node.discharge_power)}</div>` : ""
      ].join("");
    }
    if (type === "consumer") {
      return node.power ? `<div>${this._value(node.power)}</div>` : "";
    }
    if (type === "inverter") {
      return [
        node.current ? `<div>${this._value(node.current)}</div>` : "",
        node.voltage ? `<div>${this._value(node.voltage)}</div>` : "",
        node.power ? `<div>${this._value(node.power)}</div>` : ""
      ].join("");
    }
    return "";
  }

  _defaultIcon(type) {
    return {
      solar: "mdi:solar-panel-large",
      grid: "mdi:transmission-tower",
      battery: "mdi:battery",
      consumer: "mdi:power-socket-eu",
      inverter: "mdi:home-battery"
    }[type] || "mdi:flash";
  }

  _batteryVisual(node) {
    const charge = Math.abs(this._num(node?.charge_power) || 0);
    const discharge = Math.abs(this._num(node?.discharge_power) || 0);
    const soc = this._num(node?.soc);

    let mode = "idle";
    if (discharge > 0) mode = "discharging";
    else if (charge > 0) mode = "charging";

    let icon = "mdi:battery-medium";
    if (soc !== null) {
      if (soc <= 20) icon = "mdi:battery-low";
      else if (soc >= 71) icon = "mdi:battery-high";
    }

    return { mode, icon };
  }

  _inverterBatteryShare(node) {
    const output = Math.abs(this._num(node?.power) || 0);
    if (output <= 0) return 0;

    const batteries = [this._config.battery1, this._config.battery2];
    const discharge = batteries.reduce((sum, battery) => {
      return sum + Math.abs(this._num(battery?.discharge_power) || 0);
    }, 0);

    return Math.max(0, Math.min(100, (discharge / output) * 100));
  }


  _node(type, key, node, cls) {
    const keys = type === "battery"
      ? ["soc", "charge_power", "discharge_power"]
      : ["power", "voltage", "current", "switch", "status"];
    if (!this._configured(node, keys)) return "";

    const state = this._nodeState(node);
    const action = node.switch ? "toggle" : "info";
    const entity = this._mainEntity(node, type) || "";

    const batteryVisual = type === "battery" ? this._batteryVisual(node) : null;
    const icon = node.icon ||
      (batteryVisual ? batteryVisual.icon : this._defaultIcon(type));

    const batteryClass = batteryVisual ? ` ${batteryVisual.mode}` : "";

    let ringStyle = "";
    let inverterShare = 0;
    if (type === "inverter") {
      inverterShare = this._inverterBatteryShare(node);
      ringStyle = ` style="--battery-share:${inverterShare.toFixed(2)}%"`;
    }

    return `
      <div class="node-wrap ${cls}">
        ${node.name ? `<div class="node-title">${node.name}</div>` : ""}
        <button class="node-circle ${type} ${state}${batteryClass}"
          ${ringStyle}
          data-action="${action}" data-key="${key}" data-entity="${entity}">
          ${type === "inverter" ? `
            <span class="inverter-ring" aria-hidden="true"></span>
          ` : ""}
          <div class="metrics top">${this._nodeMetrics(type, node)}</div>
          <ha-icon icon="${icon}"></ha-icon>
          ${node.switch ? `<span class="switch-dot ${state}"></span>` : ""}
        </button>
      </div>
    `;
  }

  _gridNode() {
    const grids = [
      ["grid", this._config.grid],
      ["grid2", this._config.grid2],
      ["grid3", this._config.grid3]
    ].filter(([, n]) => this._configured(n, ["power", "voltage", "switch", "status"]));

    if (!grids.length) return "";

    return `
      <div class="node-wrap mid-left grid-group">
        ${grids.map(([key, node], index) => `
          <div class="grid-entry">
            ${index === 0 && node.name ? `<div class="node-title">${node.name}</div>` : ""}
            <button class="node-circle grid ${this._nodeState(node)} small-${grids.length}"
              data-action="${node.switch ? "toggle" : "info"}"
              data-key="${key}"
              data-entity="${this._mainEntity(node, "grid") || ""}">
              <div class="metrics top">${this._nodeMetrics("grid", node)}</div>
              <ha-icon icon="${node.icon || this._defaultIcon("grid")}"></ha-icon>
              ${node.switch ? `<span class="switch-dot ${this._nodeState(node)}"></span>` : ""}
            </button>
            ${index > 0 && node.name ? `<div class="mini-name">${node.name}</div>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  _batteryFlows(node) {
    if (!node) return [];

    const flows = [];
    const charge = this._num(node.charge_power);
    const discharge = this._num(node.discharge_power);

    if (charge !== null && Math.abs(charge) > 0) {
      flows.push({
        color: "charge",
        direction: node.charge_direction === "from_center" ? "out" : "in"
      });
    }

    if (discharge !== null && Math.abs(discharge) > 0) {
      flows.push({
        color: "discharge",
        direction: node.discharge_direction === "to_center" ? "in" : "out"
      });
    }

    return flows;
  }

  _stopFlowAnimation() {
    if (this._flowAnimationFrame) {
      cancelAnimationFrame(this._flowAnimationFrame);
      this._flowAnimationFrame = 0;
    }
  }

  _startFlowAnimation() {
    this._stopFlowAnimation();

    const root = this.shadowRoot;
    if (!root) return;

    const items = Array.from(root.querySelectorAll(".flow-dot")).map(dot => {
      const path = root.getElementById(dot.dataset.pathId);
      if (!path || typeof path.getTotalLength !== "function") return null;

      let length;
      try {
        length = path.getTotalLength();
      } catch (_) {
        return null;
      }

      if (!Number.isFinite(length) || length <= 0) return null;

      return {
        dot,
        path,
        length,
        direction: dot.dataset.direction || "in"
      };
    }).filter(Boolean);

    if (!items.length) return;

    const duration = 1800;

    const frame = now => {
      for (const item of items) {
        const elapsed = now - this._flowEpoch;
        let progress = ((elapsed % duration) + duration) % duration / duration;

        if (item.direction === "out") progress = 1 - progress;

        try {
          const point = item.path.getPointAtLength(item.length * progress);
          item.dot.setAttribute("cx", String(point.x));
          item.dot.setAttribute("cy", String(point.y));
        } catch (_) {
          item.dot.setAttribute("cx", "-10");
          item.dot.setAttribute("cy", "-10");
        }
      }

      this._flowAnimationFrame = requestAnimationFrame(frame);
    };

    this._flowAnimationFrame = requestAnimationFrame(frame);
  }

  disconnectedCallback() {
    this._stopFlowAnimation();
  }


  _render() {
    const c = this._config;
    const configuredFontSize = Number(c.appearance?.font_size);
    const fontSize = Number.isFinite(configuredFontSize)
      ? Math.min(24, Math.max(8, configuredFontSize))
      : 15;
    const solarTotal = this._solarTotalData();
    const has = {
      s2: this._configured(c.solar2, ["power", "voltage"]),
      s1: this._configured(c.solar1, ["power", "voltage"]),
      c1: this._configured(c.consumer1, ["power", "switch", "status"]),
      grid: [c.grid, c.grid2, c.grid3].some(n => this._configured(n, ["power", "voltage", "switch", "status"])),
      inv: this._configured(c.inverter_output, ["power", "voltage", "current", "switch", "status"]),
      b2: this._configured(c.battery2, ["soc", "charge_power", "discharge_power"]),
      b1: this._configured(c.battery1, ["soc", "charge_power", "discharge_power"]),
      c2: this._configured(c.consumer2, ["power", "switch", "status"]),
      solarTotal: this._configured(c.solar_total, ["power"])
    };

    const consumer1Source = c.consumer1?.path_source || "inverter";
    const consumer2Source = c.consumer2?.path_source || "inverter";

    const paths = {
      s2: "M17 17 C34 17 35 38 50 50",
      s1: "M50 17 C50 30 50 39 50 50",
      c1: consumer1Source === "center"
        ? "M83 17 C83 34 66 36 50 50"
        : "M83 17 C83 29 83 39 83 50",
      grid: "M17 50 C31 50 39 50 50 50",
      inv: "M83 50 C70 50 61 50 50 50",
      b2: "M17 83 C34 83 35 63 50 50",
      b1: "M50 83 C50 69 50 60 50 50",
      c2: consumer2Source === "center"
        ? "M83 83 C83 66 66 64 50 50"
        : "M83 83 C83 71 83 61 83 50"
    };

    const line = (id, enabled, flows = [], offset = 0) => {
      if (!enabled) return "";

      const dots = flows
        .filter(flow => flow && flow.direction !== "idle")
        .map((flow, index) => `
          <circle
            class="flow-dot ${flow.color || "default"}"
            data-path-id="flow-path-${id}"
            data-direction="${flow.direction}"
            r="1.35"
            cx="-10"
            cy="-10">
          </circle>
        `)
        .join("");

      const activeColor = flows.find(
        flow => flow && flow.direction !== "idle"
      )?.color || "";

      return `
        <path
          id="flow-path-${id}"
          class="base${activeColor ? ` ${activeColor}` : ""}"
          d="${paths[id]}">
        </path>
        ${dots}
      `;
    };

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display:block;
          --line: var(--divider-color, #b0b0b0);
          --solar: #078c16;
          --grid: #4b97ce;
          --battery: #ff1010;
          --consumer: #ff7900;
          --inverter: #078c16;
          --text: var(--primary-text-color, #333);
          --muted: var(--secondary-text-color, #666);
        }
        ha-card {
          position:relative;
          overflow:hidden;
          min-height:410px;
          padding:12px;
          box-sizing:border-box;
        }
        .layout {
          position:relative;
          z-index:2;
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          grid-template-rows:repeat(3,minmax(120px,1fr));
          min-height:386px;
          align-items:center;
          justify-items:center;
        }
        .top-left{grid-column:1;grid-row:1}
        .top-center{grid-column:2;grid-row:1}
        .top-right{grid-column:3;grid-row:1}
        .mid-left{grid-column:1;grid-row:2}
        .mid-right{grid-column:3;grid-row:2}
        .bottom-left{grid-column:1;grid-row:3}
        .bottom-center{grid-column:2;grid-row:3}
        .bottom-right{grid-column:3;grid-row:3}
        .junction{
          grid-column:2;grid-row:2;
          width:10px;height:10px;border-radius:50%;
          background:var(--solar);
          z-index:4;
        }
        .node-wrap{
          width:100%;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          min-width:0;
        }
        .node-title{
          color:var(--muted);
          font-size:var(--spfc-font-size,15px);
          line-height:1.1;
          margin-bottom:4px;
          text-align:center;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          max-width:100%;
        }
        .node-circle{
          width:88px;
          height:88px;
          border-radius:50%;
          border:3px solid;
          background:var(--card-background-color,#fff);
          color:var(--text);
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:2px;
          position:relative;
          cursor:pointer;
          padding:7px;
          box-sizing:border-box;
          font:inherit;
          transition:border-color .25s ease;
        }
        .node-circle.solar{border-color:var(--solar)}
        .node-circle.grid{border-color:var(--grid)}
        .node-circle.battery{border-color:#0a9e20}
        .node-circle.battery.idle{border-color:#0a9e20}
        .node-circle.battery.charging{border-color:#0a9e20}
        .node-circle.battery.discharging{border-color:#ff1010}
        .node-circle.consumer{border-color:var(--consumer)}
        .node-circle.inverter{
          border-color:transparent;
          isolation:isolate;
        }
        .inverter-ring{
          position:absolute;
          inset:-3px;
          border-radius:50%;
          background:conic-gradient(
            #ff1010 0 var(--battery-share,0%),
            #0a9e20 var(--battery-share,0%) 100%
          );
          z-index:-2;
          pointer-events:none;
        }
        .inverter-ring::after{
          content:"";
          position:absolute;
          inset:3px;
          border-radius:50%;
          background:var(--card-background-color,#fff);
          z-index:-1;
        }
        .node-circle.off{opacity:.55}
        .node-circle.unavailable{filter:grayscale(1);opacity:.45}
        .node-circle > *:not(.inverter-ring){position:relative;z-index:1}
        .node-circle ha-icon{--mdc-icon-size:24px}
        .metrics{
          font-size:calc(var(--spfc-font-size,15px) * .73);
          line-height:1.15;
          text-align:center;
          white-space:nowrap;
        }
        .metrics .accent,.metrics .charge{color:#009b00}
        .metrics .discharge{color:#ff1111}
        .metrics .import{color:#7254e8}
        .switch-dot{
          position:absolute;
          right:8px;
          top:8px;
          width:13px;
          height:13px;
          border-radius:50%;
          background:#777;
          border:2px solid var(--card-background-color,#fff);
        }
        .switch-dot.on{background:#13a513}
        .switch-dot.off{background:#ff1010}
        .switch-dot.unavailable{background:#777}
        .mini-name{
          font-size:calc(var(--spfc-font-size,15px) * .73);
          color:var(--muted);
          margin-top:2px;
        }
        .grid-group{
          flex-direction:row;
          gap:4px;
        }
        .grid-entry{
          display:flex;
          flex-direction:column;
          align-items:center;
          min-width:0;
        }
        .grid-group .node-circle.small-2{width:68px;height:68px}
        .grid-group .node-circle.small-3{width:54px;height:54px;padding:2px}
        .grid-group .small-2 .metrics{font-size:10px}
        .grid-group .small-3 .metrics{font-size:8px}
        .grid-group .small-3 ha-icon{--mdc-icon-size:15px}
        svg{
          position:absolute;
          inset:12px;
          width:calc(100% - 24px);
          height:calc(100% - 24px);
          z-index:1;
          pointer-events:none;
          overflow:visible;
        }
        .base{
          fill:none;
          stroke:var(--line);
          stroke-width:.55;
          vector-effect:non-scaling-stroke;
          opacity:.7;
          transition:stroke .25s ease;
        }
        .flow-dot{
          stroke:var(--card-background-color,#fff);
          stroke-width:.35;
          vector-effect:non-scaling-stroke;
          pointer-events:none;
          shape-rendering:auto;
        }
        .base.solar{stroke:var(--solar)}
        .base.grid{stroke:var(--grid)}
        .base.consumer{stroke:var(--consumer)}
        .base.inverter{stroke:#8e44ad}
        .base.charge{stroke:#0a9e20}
        .base.discharge{stroke:#ff1010}
        .base.default{stroke:var(--solar)}
        .base.solar,
        .base.grid,
        .base.consumer,
        .base.inverter,
        .base.charge,
        .base.discharge,
        .base.default{
          stroke-width:1.1;
          opacity:.95;
        }
        .flow-dot.solar{fill:var(--solar)}
        .flow-dot.grid{fill:var(--grid)}
        .flow-dot.consumer{fill:var(--consumer)}
        .flow-dot.inverter{fill:#8e44ad}
        .flow-dot.charge{fill:#0a9e20}
        .flow-dot.discharge{fill:#ff1010}
        .flow-dot.default{fill:var(--solar)}
        .solar-total{
          position:absolute;
          z-index:5;
          left:50%;
          top:34.5%;
          transform:translate(-50%,-50%);
          min-width:78px;
          padding:4px 8px;
          border:1px solid var(--solar);
          border-radius:8px;
          background:var(--card-background-color,#fff);
          color:var(--text);
          text-align:center;
          box-sizing:border-box;
          font:inherit;
          font-size:calc(var(--spfc-font-size,15px) * .8);
          line-height:1.15;
          cursor:default;
          appearance:none;
          -webkit-appearance:none;
        }
        .solar-total.clickable{cursor:pointer}
        .solar-total.clickable:hover{
          background:var(--secondary-background-color,#f2f2f2);
        }
        .solar-total.calculated{
          opacity:1;
          cursor:default;
        }
        .solar-total:focus-visible{
          outline:2px solid var(--primary-color,#03a9f4);
          outline-offset:2px;
        }
        .solar-total strong{
          display:block;
          color:var(--solar);
          font-size:calc(var(--spfc-font-size,15px) * .93);
        }
        @media(max-width:520px){
          ha-card{min-height:370px;padding:6px}
          .layout{min-height:358px;grid-template-rows:repeat(3,minmax(110px,1fr))}
          .node-circle{width:76px;height:76px}
          .node-title{font-size:var(--spfc-font-size,15px)}
          .metrics{font-size:calc(var(--spfc-font-size,15px) * .73)}
          .node-circle ha-icon{--mdc-icon-size:21px}
          .grid-group .node-circle.small-2{width:58px;height:58px}
          .grid-group .node-circle.small-3{width:46px;height:46px}
        }
      </style>

      <ha-card style="--spfc-font-size:${fontSize}px">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          xmlns:xlink="http://www.w3.org/1999/xlink">
          ${line("s2", has.s2, [{ direction: this._direction(c.solar2), color: "solar" }], .1)}
          ${line("s1", has.s1, [{ direction: this._direction(c.solar1), color: "solar" }], .2)}
          ${line("c1", has.c1, [{ direction: this._consumerDirection(c.consumer1), color: "consumer" }], .3)}
          ${line("grid", has.grid, [{ direction: this._direction(c.grid), color: "grid" }], .4)}
          ${line("inv", has.inv, [{ direction: this._direction(c.inverter_output), color: "inverter" }], .5)}
          ${line("b2", has.b2, this._batteryFlows(c.battery2), .6)}
          ${line("b1", has.b1, this._batteryFlows(c.battery1), .7)}
          ${line("c2", has.c2, [{ direction: this._consumerDirection(c.consumer2), color: "consumer" }], .8)}
        </svg>

        ${(has.s1 && has.s2) ? `
          <button
            type="button"
            class="solar-total${solarTotal.entity ? " clickable" : " calculated"}"
            ${solarTotal.entity
              ? `data-action="info" data-key="solar_total" data-entity="${solarTotal.entity}" title="Відкрити історію"`
              : `title="Розраховано як сума двох сонячних полів"`}
            ${solarTotal.entity ? "" : "disabled"}>
            ${c.solar_total?.name ? `<span>${c.solar_total.name}</span>` : ""}
            <strong>${solarTotal.value}</strong>
          </button>
        ` : ""}

        <div class="layout">
          ${this._node("solar", "solar2", c.solar2, "top-left")}
          ${this._node("solar", "solar1", c.solar1, "top-center")}
          ${this._node("consumer", "consumer1", c.consumer1, "top-right")}
          ${this._gridNode()}
          ${(has.s1 || has.s2 || has.grid || has.inv || has.b1 || has.b2 || has.c1 || has.c2)
            ? `<div class="junction"></div>`
            : ""}
          ${this._node("inverter", "inverter_output", c.inverter_output, "mid-right")}
          ${this._node("battery", "battery2", c.battery2, "bottom-left")}
          ${this._node("battery", "battery1", c.battery1, "bottom-center")}
          ${this._node("consumer", "consumer2", c.consumer2, "bottom-right")}
        </div>
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => {
        const node = this._config[el.dataset.key];
        if (el.dataset.action === "toggle") this._toggle(node);
        else this._moreInfo(el.dataset.entity);
      });
    });

    this._startFlowAnimation();
  }
}



class SimplePowerFlowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._forms = new Map();
  }

  set hass(hass) {
    this._hass = hass;
    this._syncForms();
  }

  setConfig(config) {
    this._config = structuredClone(config || {});
    this._render();
  }

  _text(name, label) {
    return {
      name,
      label,
      selector: { text: {} }
    };
  }

  _number(name, label, min, max, step = 1, unit = "") {
    return {
      name,
      label,
      selector: {
        number: {
          min,
          max,
          step,
          mode: "box",
          ...(unit ? { unit_of_measurement: unit } : {})
        }
      }
    };
  }

  _icon(name = "icon", label = "Іконка") {
    return {
      name,
      label,
      selector: { icon: {} }
    };
  }

  _entity(name, label, domain = null) {
    const entity = {};
    if (domain) entity.domain = domain;

    return {
      name,
      label,
      selector: { entity }
    };
  }

  _select(name, label, options) {
    return {
      name,
      label,
      selector: {
        select: {
          mode: "dropdown",
          options: options.map(([value, optionLabel]) => ({
            value,
            label: optionLabel
          }))
        }
      }
    };
  }

  _direction(name = "positive_direction", label = "Додатний знак") {
    return this._select(name, label, [
      ["to_center", "До центру"],
      ["from_center", "Від центру"]
    ]);
  }

  _schema(type) {
    if (type === "appearance") {
      return [
        this._number("font_size", "Розмір шрифту", 8, 24, 1, "px")
      ];
    }

    const common = [
      this._text("name", "Назва"),
      this._icon()
    ];

    if (type === "battery") {
      return [
        ...common,
        this._entity("soc", "Рівень заряду (SOC)", "sensor"),
        this._entity("charge_power", "Потужність заряду", "sensor"),
        this._select("charge_direction", "Напрямок заряду", [
          ["to_center", "До центру"],
          ["from_center", "Від центру"]
        ]),
        this._entity("discharge_power", "Потужність розряду", "sensor"),
        this._select("discharge_direction", "Напрямок розряду", [
          ["from_center", "Від центру"],
          ["to_center", "До центру"]
        ])
      ];
    }

    if (type === "solar_total") {
      return [
        ...common,
        this._entity("power", "Сумарна потужність", "sensor")
      ];
    }

    const schema = [
      ...common,
      this._entity("power", "Потужність", "sensor")
    ];

    if (["solar", "grid", "inverter"].includes(type)) {
      schema.push(this._entity("voltage", "Напруга", "sensor"));
    }

    if (type === "inverter") {
      schema.push(this._entity("current", "Струм", "sensor"));
    }

    if (["grid", "consumer", "inverter"].includes(type)) {
      schema.push(this._entity("switch", "Перемикач", "switch"));
      schema.push(this._entity("status", "Сутність стану"));
    }

    if (type === "consumer") {
      schema.push(this._select("path_source", "Джерело шляху", [
        ["inverter", "Вихід інвертора"],
        ["center", "Центр"]
      ]));
      schema.push(this._select("positive_direction", "Додатна потужність", [
        ["from_center", "Від джерела до споживача"],
        ["to_center", "Від споживача до джерела"]
      ]));
    } else {
      schema.push(this._direction());
    }

    return schema;
  }

  _sections() {
    return [
      ["appearance", "Вигляд картки", "appearance", false],
      ["solar1", "Сонячне поле 1", "solar", false],
      ["solar2", "Сонячне поле 2", "solar", true],
      ["solar_total", "Сума сонячних полів", "solar_total", true],
      ["grid", "Основна мережа", "grid", false],
      ["grid2", "Додаткова мережа 1", "grid", true],
      ["grid3", "Додаткова мережа 2", "grid", true],
      ["battery1", "Батарея 1", "battery", false],
      ["battery2", "Батарея 2", "battery", true],
      ["inverter_output", "Вихід інвертора", "inverter", false],
      ["consumer1", "Споживач 1", "consumer", false],
      ["consumer2", "Споживач 2", "consumer", true]
    ];
  }

  _updateSection(section, value) {
    const config = structuredClone(this._config || {});
    const cleaned = {};

    for (const [key, fieldValue] of Object.entries(value || {})) {
      if (fieldValue !== "" && fieldValue !== null && fieldValue !== undefined) {
        cleaned[key] = fieldValue;
      }
    }

    if (Object.keys(cleaned).length) {
      config[section] = cleaned;
    } else {
      delete config[section];
    }

    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true
    }));
  }

  _createForm(section, type) {
    const form = document.createElement("ha-form");
    form.dataset.section = section;
    form.hass = this._hass;
    form.data = structuredClone(this._config?.[section] || {});
    form.schema = this._schema(type);
    form.computeLabel = schema => schema.label || schema.name;
    form.addEventListener("value-changed", event => {
      this._updateSection(section, event.detail?.value || {});
    });
    this._forms.set(section, form);
    return form;
  }

  _syncForms() {
    for (const [section, form] of this._forms) {
      form.hass = this._hass;
      form.data = structuredClone(this._config?.[section] || {});
    }
  }

  _render() {
    this._forms.clear();
    this.shadowRoot.innerHTML = `
      <style>
        :host{
          display:block;
          min-height:120px;
        }
        .editor{
          display:flex;
          flex-direction:column;
          gap:10px;
        }
        .notice{
          padding:10px 12px;
          border-radius:8px;
          background:var(--secondary-background-color,#f5f5f5);
          color:var(--secondary-text-color,#666);
          font-size:13px;
        }
        details{
          border:1px solid var(--divider-color,#d0d0d0);
          border-radius:10px;
          background:var(--card-background-color,#fff);
          overflow:hidden;
        }
        summary{
          min-height:46px;
          padding:0 14px;
          display:flex;
          align-items:center;
          cursor:pointer;
          font-weight:600;
          box-sizing:border-box;
          user-select:none;
        }
        summary:hover{
          background:var(--secondary-background-color,#f5f5f5);
        }
        .form-host{
          padding:4px 14px 14px;
        }
        ha-form{
          display:block;
        }
      </style>
      <div class="editor">
        ${this._hass ? "" : `
          <div class="notice">
            Очікування компонентів і списку сутностей Home Assistant…
          </div>
        `}
      </div>
    `;

    const editor = this.shadowRoot.querySelector(".editor");

    for (const [section, title, type, optional] of this._sections()) {
      const details = document.createElement("details");
      if (!optional) details.open = true;

      const summary = document.createElement("summary");
      summary.textContent = optional ? `${title} — необов’язково` : title;

      const host = document.createElement("div");
      host.className = "form-host";
      host.appendChild(this._createForm(section, type));

      details.append(summary, host);
      editor.appendChild(details);
    }

    this._syncForms();
  }
}

if (!customElements.get("simple-power-flow-card")) {
  customElements.define("simple-power-flow-card", SimplePowerFlowCard);
}
if (!customElements.get("simple-power-flow-card-editor")) {
  customElements.define("simple-power-flow-card-editor", SimplePowerFlowCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === "simple-power-flow-card")) {
  window.customCards.push({
    type: "simple-power-flow-card",
    name: "Simple Power Flow Card",
    description: "Картка енергопотоків 3×3 із двома батареями та двома сонячними масивами",
    preview: true,
    documentationURL: "https://github.com/test3210-d/smply-flow-card"
  });
}


console.info(
  `%c SIMPLE-POWER-FLOW-CARD %c v${SIMPLE_POWER_FLOW_CARD_VERSION} `,
  "color: white; background: #0a9e20; font-weight: 700;",
  "color: #0a9e20; background: white; font-weight: 700;"
);

import * as path from "https://unpkg.com/d3-path@1?module";
import * as scale from "https://unpkg.com/d3-scale@2?module";
import * as selection from "https://unpkg.com/d3-selection@1?module";
import * as timer from "https://unpkg.com/d3-timer@1?module";
import * as transition from "https://unpkg.com/d3-transition@1?module";

const d3 = {
  ...selection,
  ...path,
  ...timer,
  ...scale,
  ...transition,
};

export class Timeline {
  constructor({ parent }) {
    this.parent = parent;
    this.apps = new Map();
    this.timer;
    this.maxValue = 7 * 60; // max seconds
    this.tickValue = 30;
    this._animationActive = false;
    this._animationTimer = 0;
    this.create();

    // The timeline is hidden on mobile (<768px). If the browser is resized
    // from a starting viewport size where the timeline is hidden, it will
    // fail to render. This is because when the timeline was initially
    // created, it would have been unable to calculate the absolute
    // positioning of various elements required to draw and position the
    // timeline.

    // To get around this (albiet niche) issue, we remove the SVG element
    // completely and re-draw it every time the browser is resized.
    let ro = new ResizeObserver(() => this.create());
    ro.observe(document.body);
  }

  create() {
    this.el = d3.select(this.parent);
    this.bbox = this.el.node().getBoundingClientRect();
    this.height = this.bbox.height;
    this.width = this.bbox.width;
    this.margin = { left: this.width / 2, right: 0, top: 0, bottom: 0 };
    this.innerWidth = this.width - this.margin.left - this.margin.right;
    this.innerHeight = this.height - this.margin.top - this.margin.bottom;

    // Create SVG element and attach to DOM, replacing any existing SVG
    // elements if necessary
    this.svg = this.drawSvg();
    this.el.node().innerHTML = "";
    this.el.node().appendChild(this.svg.node());
  }

  push({ app, value }) {
    if (this.apps.has(app.name)) return;
    let el = d3.select(`#${app.name}`);
    let bbox = el.node().getBoundingClientRect();
    let target = {
      y: bbox.y + bbox.height / 2 - this.bbox.y,
      x: this.bbox.x >= bbox.x ? 0 : this.width,
    };
    let props = {
      el,
      value,
      sourcePosition: [this.margin.left, this.timelineScale(value)],
      targetPosition: [target.x, target.y],
    };
    let linkGenerator = d3
      .linkHorizontal()
      .source((d) => d.props.sourcePosition)
      .target((d) => d.props.targetPosition);
    let item = {
      id: app.name,
      app,
      props,
      linkGenerator,
    };
    this.apps.set(app.name, item);
    this.renderTimelineData();
  }

  /* Show countdown during deployment ------------------------------------- */

  startCountdown() {
    this.svg.node().classList.add("is-counting");
    this.timer = d3.interval((ms) => this.countdownHandler(ms), 100);
    d3.timeout(this.stopCountdown, 7 * 60000);
  }

  stopCountdown() {
    this.timer.stop();
    this.svg.node().classList.remove("is-counting");
    d3.select(".countdown .axis line").attr("y2", 0);
    d3.select(".countdown .axis circle").attr("cy", 0);
  }

  countdownHandler(ms) {
    let value = Math.floor(this.timelineScale(ms / 1000));
    let totalSeconds = Math.floor(ms / 1000);

    // Update countdown clock
    let minutePart = Math.floor(ms / 1000 / 60)
      .toString()
      .padStart(2, "0");
    let secondPart = Math.round((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");
    d3.select("text.clock").text(`${minutePart}:${secondPart}`);

    // Increment axis progress tracker
    d3.select(".countdown line.leader").transition().attr("y2", value);
    d3.select(".countdown circle.leader").transition().attr("cy", value);

    d3.selectAll(".tick")
      .filter(function () {
        return parseInt(this.dataset.value) <= totalSeconds + 5;
      })
      .classed("active", true);
  }

  /* Generate base SVG container ------------------------------------------- */

  drawSvg() {
    let svg = d3
      .create("svg")
      .attr("viewBox", `0 0 ${this.width} ${this.height}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .classed("timeline", true);

    // Drop-shadow filter
    svg
      .append("defs")
      .append("filter")
      .attr("id", "shadow")
      .attr("width", "200%")
      .attr("height", "200%")
      .attr("y", "-30%")
      .attr("x", "-30%")
      .append("feDropShadow")
      .attr("dx", 1)
      .attr("dy", 2)
      .attr("stdDeviation", 3)
      .attr("flood-opacity", 0.1)
      .attr("flood-color", "#0a0a0a");

    // Timeline axis (incl. countdown)
    svg
      .append(() => this.axis)
      .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

    // Paths that link axis markers to target IFrames
    svg.append("g").classed("links", true);

    // Markers
    svg
      .append("g")
      .classed("markers", true)
      .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    svg.append("g").classed("targets", true);
    return svg;
  }

  /* Render Timeline data ----------------------------------------------------- */

  renderTimelineData() {
    let nodes = Array.from(this.apps.values());

    // Create themed gradient filter for each item
    const gradientOffset = (colors) =>
      d3.scaleLinear().domain([0, colors.length]).range([0, 100]);

    this.svg
      .select("defs")
      .selectAll("linearGradient.bg")
      .data(nodes)
      .enter()
      .remove()
      .append("linearGradient")
      .classed("bg", true)
      .attr("id", (d) => `bg-${d.app.name}`)
      .attr("x1", -1.5)
      .attr("x2", 1.5)
      .attr("y1", -2)
      .attr("y2", 2)
      .attr("gradientTransform", "rotate(-15)")
      .each(function (d) {
        d.app.theme.colors.forEach((c) => {
          let idx = d.app.theme.colors.indexOf(c);
          d3.select(this)
            .append("stop")
            .attr("stop-color", c)
            .attr("offset", gradientOffset(idx));
        });
      });

    // Helper function for updating data nodes
    const update = ({ parent, tag, nodes }) => {
      let [tagName, className] = tag.split(".");
      let u = this.svg
        .select(parent)
        .selectAll(tag)
        .data(nodes, (d) => d.id);
      let enter = u.enter().append(tagName);
      if (className) {
        enter = enter.classed(className, true);
      }
      u.exit().remove();
      return enter.merge(u);
    };

    // Link axis to IFrames
    update({ parent: "g.links", tag: "path.link", nodes })
      .attr("data-app", (d) => d.app.name)
      .attr("stroke", (d) => `url(#bg-${d.app.name})`)
      .transition()
      .attr("d", (d) => d.linkGenerator(d));

    // Place markers on axis
    update({ parent: "g.markers", tag: "circle.source", nodes })
      .attr("fill", (d) => `url(#bg-${d.app.name})`)
      .attr("cy", (d) => this.timelineScale(d.props.value))
      .attr("r", 3);

    // Place markers on target
    update({ parent: "g.targets", tag: "circle.target", nodes })
      .attr("fill", (d) => `url(#bg-${d.app.name})`)
      .attr("cx", (d) => d.props.targetPosition[0])
      .attr("cy", (d) => d.props.targetPosition[1])
      .attr("r", 4);
  }

  /* Timeline D3 Components ------------------------------------------------ */

  get axis() {
    let axis = d3.create("svg:g").classed("axis", true);
    axis.append("line").attr("y2", this.innerHeight);
    axis
      .selectAll("circle.edge")
      .data([0, this.innerHeight])
      .enter()
      .append("circle")
      .classed("edge", true)
      .classed("origin", (d) => d == 0)
      .classed("end", (d) => d == this.innerHeight)
      .attr("data-value", (d) => d)
      .attr("cy", (d) => d)
      .attr("r", 3);

    // Add labels to axis at 30 minute intervals
    let tickData = Array.from(Array(this.maxValue / this.tickValue + 1), (_, i) => {
      let tick = i * this.tickValue;
      return {
        tick,
        y: this.timelineScale(tick),
        isMajor: tick % 60 == 0,
        isMinor: tick % 60 != 0,
      };
    });

    // Add mask to hide part of the axis behind ticks/labels
    let mask = axis.append("g").classed("mask", true);
    mask
      .selectAll("rect.minor")
      .data(tickData.filter((d) => d.isMinor))
      .enter()
      .append("circle")
      .classed("tick", true)
      .classed("minor", true)
      .attr("data-value", (d) => d.tick)
      .attr("cx", 0)
      .attr("cy", (d) => d.y)
      .attr("r", 4);
    mask
      .selectAll("rect.major")
      .data(tickData.filter((d) => d.isMajor))
      .enter()
      .append("rect")
      .classed("tick", true)
      .classed("major", true)
      .attr("data-value", (d) => d.tick)
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("width", 44)
      .attr("height", 18)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("transform", "translate(-22, -10)");

    // Create separate axis to overlay countdown
    axis.append(() => this.countdown);

    // Add ticks
    let ticks = axis.append("g").classed("ticks", true);
    ticks
      .selectAll("circle.tick")
      .data(tickData.filter((d) => d.isMinor))
      .enter()
      .append("circle")
      .classed("tick", true)
      .classed("minor", true)
      .attr("data-value", (d) => d.tick)
      .attr("cx", 0)
      .attr("cy", (d) => d.y)
      .attr("r", 3);

    ticks
      .selectAll("text.tick")
      .data(tickData.filter((d) => d.isMajor))
      .enter()
      .append("text")
      .classed("tick", true)
      .classed("major", true)
      .attr("data-value", (d) => d.tick)
      .attr("x", 0)
      .attr("y", (d) => d.y)
      .attr("transform", "translate(0, 3)")
      .attr("text-anchor", "middle")
      .text((d) => `${d.tick / 60} min`);

    return axis.node();
  }

  get countdown() {
    let countdown = d3.create("svg:g").classed("countdown", true);
    countdown.append("line").classed("leader", true).attr({ x1: 0, y1: 0, x2: 0, y2: 0 });
    countdown.append("circle").classed("leader", true).attr("r", 2).attr("cy", 0);
    countdown
      .append("text")
      .classed("clock", true)
      .attr("x", 0)
      .attr("y", 0)
      .attr("transform", "translate(0, -25)")
      .attr("text-anchor", "middle")
      .text("00:00");
    return countdown.node();
  }

  get timelineScale() {
    let maxValue = this.maxValue;
    let maxLength = this.innerHeight;
    return d3.scaleLinear().domain([0, maxValue]).range([0, maxLength]);
  }
}

window.Timeline = Timeline;

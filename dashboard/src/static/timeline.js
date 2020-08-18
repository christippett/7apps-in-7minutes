(function () {
  "use strict";
  class Timeline {
    constructor({ parent }) {
      this.apps = new Map();
      this.maxValue = 7 * 60; // max seconds
      this.tickValue = 30;
      this.el = d3.select(parent);
      this.bbox = this.el.node().getBoundingClientRect();
      this.height = this.bbox.height;
      this.width = this.bbox.width;
      this.margin = { left: this.width / 2, right: 0, top: 0, bottom: 0 };
      this.innerWidth = this.width - this.margin.left - this.margin.right;
      this.innerHeight = this.height - this.margin.top - this.margin.bottom;
    }

    get timelineScale() {
      let maxValue = this.maxValue;
      let maxLength = this.innerHeight;
      return d3.scaleLog().domain([45, maxValue]).range([0, maxLength]);
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
        .linkVertical()
        .source((d) => d.props.sourcePosition)
        .target((d) => d.props.targetPosition);
      // let linkGenerator = d3
      //   .linkHorizontal()
      //   .source((d) => [d.props.sourcePosition[1], d.props.sourcePosition[0]])
      //   .target((d) => [d.props.targetPosition[1], d.props.targetPosition[0]]);
      let item = {
        id: app.name,
        app,
        props,
        linkGenerator,
      };
      this.apps.set(app.name, item);
      this.refresh();
    }

    remove() {
      this.el.remove();
    }

    create() {
      this.svg = d3
        .create("svg")
        .attr("viewBox", `0 0 ${this.width} ${this.height}`)
        .attr("width", "100%")
        .attr("height", "100%")
        .classed("timeline", true);

      // Create drop-shadow filter
      this.svg
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

      let timeline = this.svg.append("g");
      this.drawAxis(timeline);

      // Add containers for plot items
      let items = timeline.append("g").classed("items", true);

      items.append("g").classed("links", true);
      items
        .append("g")
        .classed("markers", true)
        .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
      items.append("g").classed("targets", true);

      this.el.append(() => this.svg.node());
    }

    drawAxis(parent) {
      let axis = parent
        .append("g")
        .classed("axis", true)
        .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
      let base = axis.append("g").classed("base", true);
      base.append("line").attr("y2", this.innerHeight);
      base
        .selectAll("circle")
        .data([0, this.innerHeight])
        .enter()
        .append("circle")
        .attr("r", 3)
        .attr("cy", (v) => v);

      // Add labels to axis at 30 minute intervals
      let axisTicks = Array.from(Array(this.maxValue / this.tickValue + 1), (_, i) => {
        return {
          tick: i * this.tickValue,
          y: this.timelineScale(i * this.tickValue),
          width: 50,
          height: 18,
        };
      });

      // Minor ticks
      let minorTickData = axisTicks.filter((d) => d.tick > 60 && d.tick % 60 != 0);
      let minor = axis.append("g").classed("minor-ticks", true);
      minor
        .selectAll("rect.tick")
        .data(minorTickData)
        .enter()
        .append("rect")
        .classed("tick", true)
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y)
        .attr("transform", "translate(-2, -4)")
        .attr("width", 4)
        .attr("height", 8);
      minor
        .selectAll("text")
        .data(minorTickData)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", (d) => d.y)
        .attr("transform", "translate(0, 5)")
        .attr("text-anchor", "middle")
        .text("•");

      // Major ticks
      let majorTickData = axisTicks.filter((d) => d.tick % 60 == 0);
      let major = axis.append("g").classed("major-ticks", true);
      major
        .selectAll("rect.tick")
        .data(majorTickData)
        .enter()
        .append("rect")
        .classed("tick", true)
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y || 0)
        .attr("width", (d) => d.width)
        .attr("height", (d) => d.height)
        .attr("transform", (d) => `translate(${d.width / -2}, ${d.height / -2 + 1})`);
      major
        .selectAll("text")
        .data(majorTickData)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", (d) => d.y || 0)
        .attr("transform", "translate(0, 5)")
        .attr("text-anchor", "middle")
        .text((d) => `${d.tick / 60} min`);
    }

    updateNodes({ parent, tag, nodes }) {
      // Helper function to update timeline based on new/updated data
      // https://www.d3indepth.com/enterexit/
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
    }

    refresh() {
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

      // Link axis to IFrames
      this.updateNodes({ parent: "g.links", tag: "path.link", nodes })
        .attr("data-app", (d) => d.app.name)
        .attr("stroke", (d) => `url(#bg-${d.app.name})`)
        .attr("d", (d) => d.linkGenerator(d));

      // Place markers on axis
      this.updateNodes({ parent: "g.markers", tag: "circle.source", nodes })
        .attr("fill", (d) => `url(#bg-${d.app.name})`)
        .attr("cy", (d) => this.timelineScale(d.props.value))
        .attr("r", 3);

      // Place markers on target
      this.updateNodes({ parent: "g.targets", tag: "circle.target", nodes })
        .attr("cx", (d) => d.props.targetPosition[0])
        .attr("cy", (d) => d.props.targetPosition[1])
        .attr("r", 3);
    }
  }

  window.Timeline = Timeline;
})();

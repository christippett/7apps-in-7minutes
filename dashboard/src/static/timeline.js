(function () {
  "use strict";
  class Timeline {
    constructor({ el, opts }) {
      this.options = opts;
      this.el = el;
      this.innerWidth = opts.initialWidth - opts.margin.left - opts.margin.right;
      this.innerHeight = opts.initialHeight - opts.margin.top - opts.margin.bottom;
      this.nodeMap = new Map();
      this._canvas = document.createElement("canvas").getContext("2d");
    }

    get timelineScale() {
      let maxValue = this.options.maxValue;
      let maxLength = this.innerHeight;
      return d3.scaleLinear().domain([0, maxValue]).range([0, maxLength]);
    }

    calculateTextMetrics({ text, fontSize, fontFace }) {
      this._canvas.font = `${fontSize} '${fontFace}'`;
      return this._canvas.measureText(text);
    }

    newSvg() {
      let svg = d3
        .create("svg")
        .attr("viewBox", `0 0 ${this.options.initialWidth} ${this.options.initialHeight}`)
        .attr("width", this.options.initialWidth)
        .attr("height", this.options.initialHeight)
        .classed("timeline", true);
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
      return svg;
    }

    create() {
      this.svg = this.newSvg();
      this.drawTimeline();
      d3.select(this.el).append(() => this.svg.node());
    }

    remove() {
      d3.select(this.el).remove();
    }

    push(item = { id, label, value, theme }) {
      if (this.nodeMap.has(item.id)) return;
      let textMetrics = this.calculateTextMetrics({
        text: item.label,
        fontSize: "0.8rem",
        fontFace: item.theme.font,
      });
      item.width = textMetrics.width;
      item.height = 28;
      this.nodeMap.set(
        item.id,
        new labella.Node(this.timelineScale(item.value), item.height, item)
      );
      this.refresh();
    }

    refresh() {
      let nodes = Array.from(this.nodeMap.values());
      let force = new labella.Force(this.options.labella.force).nodes(nodes).compute();
      this.drawNodes({ nodes: force.nodes() });
    }

    drawTimeline() {
      let timeline = this.svg
        .append("g")
        .attr(
          "transform",
          `translate(${this.options.margin.left}, ${this.options.margin.top})`
        );
      timeline.append("g").attr("id", "markers").classed("markers", true);
      timeline.append("g").attr("id", "labels").classed("labels", true);
      timeline.append("g").attr("id", "links").classed("links", true);

      // Add axis
      timeline
        .append("g")
        .attr("id", "axis")
        .classed("axis", true)
        .append("line")
        .attr("y2", this.innerHeight);

      // Add markers to axis bounds
      timeline
        .select("#axis")
        .selectAll("circle")
        .data([0, this.innerHeight])
        .enter()
        .append("circle")
        .attr("r", 3)
        .attr("cy", (v) => v);

      // Add labels to axis at 30 minute intervals
      let axisTicks = Array.from(
        Array(this.options.maxValue / this.options.tickValue + 1),
        (_, i) => {
          return {
            tick: i * this.options.tickValue,
            y: this.timelineScale(i * this.options.tickValue),
          };
        }
      );
      timeline
        .append("g")
        .attr("id", "ticks")
        .classed("ticks", true)
        .selectAll("text")
        .data(axisTicks)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", (d) => d.y)
        .attr("transform", "translate(-12, 2.5)")
        .attr("text-anchor", "end")
        .text((d) => {
          return d.tick % 60 == 0 ? `${d.tick / 60}min` : "-";
        });
    }

    updateNodes({ select, type, nodes }) {
      // Helper function to update timeline based on new/updated data
      // https://www.d3indepth.com/enterexit/
      let u = this.svg
        .select(select)
        .selectAll(type)
        .data(nodes, (d) => d.data.id);
      u.enter().append(type).merge(u);
      u.exit().remove();
      return u;
    }

    drawNodes({ nodes }) {
      let renderer = new labella.Renderer({
        nodeHeight: nodes[0].width,
        ...this.options.labella.renderer,
      });
      renderer.layout(nodes); // adds x,y,dx,dy to nodes

      // Create themed gradient filter for each item
      const gradientOffset = (colors) =>
        d3.scaleLinear().domain([0, colors.length]).range([0, 100]);

      this.updateNodes({ select: "defs", type: "linearGradient", nodes })
        .attr("id", (d) => d.data.id)
        .attr("x1", -1.5)
        .attr("x2", 1.5)
        .attr("y1", -2)
        .attr("y2", 2)
        .attr("gradientTransform", "rotate(-15)")
        .each(function (d) {
          d.data.theme.colors.forEach((c) => {
            let idx = d.data.theme.colors.indexOf(c);
            d3.select(this)
              .append("stop")
              .attr("stop-color", c)
              .attr("offset", gradientOffset(idx));
          });
        });

      // Label container
      this.updateNodes({ select: "#labels", type: "rect", nodes })
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y - d.dy / 2)
        .attr("width", (d) => d.data.width)
        .attr("height", (d) => d.data.height)
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("fill", (d) => `url(#${d.data.id})`);

      // Label text
      this.updateNodes({ select: "#labels", type: "text", nodes })
        .attr("fill", (d) => `url(#${d.data.id})`)
        .attr("style", (d) => `font-family: '${d.data.theme.font}', sans-serif`)
        .attr("x", (d) => d.x)
        .attr("y", (d) => d.y)
        .attr("data-width", (d) => d.data.width)
        .attr("data-dy", (d) => d.dy)
        .attr("data-dx", (d) => d.dx)
        .attr("transform", (d) => `translate(${d.dx / 2 - 2}, 5)`)
        .text((d) => d.data.label);

      // Link labels to axis
      this.updateNodes({ select: "#links", type: "path", nodes })
        .attr("d", (d) => renderer.generatePath(d))
        .attr("stroke", (d) => `url(#${d.data.id})`);

      // Place markers on axis
      this.updateNodes({ select: "#markers", type: "circle", nodes })
        .style("fill", (d) => d.data.theme.colors[0])
        .attr("cy", (d) => d.getRoot().idealPos)
        .attr("r", 3);
    }
  }

  const timelineOptions = {
    margin: { left: 25, right: 0, top: 25, bottom: 0 },
    initialWidth: 250,
    initialHeight: 450,
    maxValue: 10 * 60, // max seconds
    tickValue: 30,
    labella: {
      renderer: { layerGap: 50, direction: "right" },
      force: { minPos: -10, nodeSpacing: 20 },
    },
  };
  const timeline = new Timeline({ opts: timelineOptions, el: "#timeline" });
  timeline.create();

  window._.timeline = timeline;
})();

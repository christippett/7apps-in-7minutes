(function () {
  "use strict";
  class Timeline {
    constructor({ el, opts }) {
      this.el = d3.select(el);
      this.height = this.el.node().getBoundingClientRect().height;
      this.width = this.el.node().getBoundingClientRect().width;
      this.options = opts;
      this.innerWidth = this.width - this.width / 2;
      this.innerHeight = this.height - opts.margin.top - opts.margin.bottom;
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
        .attr("viewBox", `0 0 ${this.width} ${this.height}`)
        .attr("width", this.width)
        .attr("height", this.height)
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
      this.el.append(() => this.svg.node());
    }

    remove() {
      this.el.remove();
    }

    push(item = { id, label, value, theme }) {
      if (this.nodeMap.has(item.id)) return;
      let textMetrics = this.calculateTextMetrics({
        text: item.label,
        fontSize: "0.8rem",
        fontFace: item.theme.font,
      });
      item.frame = d3.select(`#${d.data.id}`);
      item.height = frame.node().getBoundingClientRect().height;
      item.width = textMetrics.width;
      this.nodeMap.set(
        item.id,
        new labella.Node(this.timelineScale(item.value), item.height, item)
      );
      this.refresh();
    }

    refresh() {
      let nodes = Array.from(this.nodeMap.values());
      let force = new labella.Force(this.options.labella.force).nodes(nodes).compute();
      // this.drawNodes({ nodes: force.nodes() });
      this.drawNodes({ nodes });
    }

    drawTimeline() {
      let timeline = this.svg
        .append("g")
        .attr("transform", `translate(${this.width / 2}, ${this.options.margin.top})`);

      // Add axis
      let axis = timeline.append("g").classed("axis", true);
      axis.append("line").attr("y2", this.innerHeight);
      axis
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
      axis
        .selectAll("text")
        .data(axisTicks)
        .enter()
        .append("text")
        .attr("x", 0)
        .attr("y", (d) => d.y)
        .attr("transform", "translate(15, 2.5)")
        .attr("text-anchor", "end")
        .text((d) => {
          return d.tick % 60 == 0 ? `${d.tick / 60}min` : "-";
        });

      // Add containers for plot items
      let items = timeline.append("g").classed("items", true);
      items.append("g").classed("links", true);
      items.append("g").classed("markers", true);
      items.append("g").classed("labels", true);
    }

    updateNodes({ parent, tag, nodes }) {
      // Helper function to update timeline based on new/updated data
      // https://www.d3indepth.com/enterexit/
      let [tagName, className] = tag.split(".");
      let u = this.svg
        .select(parent)
        .selectAll(tag)
        .data(nodes, (d) => d.data.id);
      let enter = u.enter().append(tagName);
      if (className) {
        enter = enter.classed(className, true);
      }
      u.exit().remove();
      return enter.merge(u);
    }

    drawNodes({ nodes }) {
      let renderer = new labella.Renderer({
        // nodeHeight: nodes[0].width,
        nodeHeight: "200",
        ...this.options.labella.renderer,
      });
      renderer.layout(nodes); // adds x,y,dx,dy to nodes

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
        .attr("id", (d) => `bg-${d.data.id}`)
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
      // this.updateNodes({ parent: "#labels", select: "rect", nodes })
      //   .attr("x", (d) => d.x)
      //   .attr("y", (d) => d.y - d.dy / 2)
      //   .attr("width", (d) => d.data.width)
      //   .attr("height", (d) => d.data.height)
      //   .attr("rx", 4)
      //   .attr("ry", 4)
      //   .attr("fill", (d) => `url(#${d.data.id})`);

      // Label text
      // this.updateNodes({ parent: "g.labels", tag: "text.label", nodes })
      //   .attr("fill", (d) => `url(#bg-${d.data.id})`)
      //   .attr("style", (d) => `font-family: '${d.data.theme.font}', sans-serif`)
      //   .attr("x", (d) => d.x)
      //   .attr("y", (d) => d.y)
      //   .attr("transform", (d) => `translate(${d.dx / 2 - 2}, 5)`)
      //   .text((d) => d.data.label);

      // Link labels to axis
      this.updateNodes({ parent: "g.links", tag: "path.label", nodes })
        .attr("stroke", (d) => `url(#bg-${d.data.id})`)
        .attr("stroke", "red")
        .attr("d", (d) => renderer.generatePath(d));

      // Place markers on axis
      this.updateNodes({ parent: "g.markers", tag: "circle.label", nodes })
        .attr("fill", (d) => `url(#bg-${d.data.id})`)
        .attr("cy", (d) => d.getRoot().idealPos)
        .attr("r", 3);
    }
  }

  window.Timeline = Timeline;
})();

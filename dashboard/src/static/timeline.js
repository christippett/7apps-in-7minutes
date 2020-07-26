(function () {
  const initTimeline = ({ options }) => {
    var innerWidth = options.initialWidth - options.margin.left - options.margin.right;
    var innerHeight = options.initialHeight - options.margin.top - options.margin.bottom;
    var timelineScale = d3
      .scaleLinear()
      .domain([0, options.timelineLimit])
      .range([0, innerHeight]);
    var svg = d3
      .create("svg")
      .attr("viewBox", `0 0 ${options.initialWidth} ${options.initialHeight}`)
      .attr("width", options.initialWidth)
      .attr("height", options.initialHeight);

    // Box-shadow filter
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

    var timeline = svg
      .append("g")
      .attr("transform", `translate(${options.margin.left}, ${options.margin.top})`);

    // Timeline axis
    timeline.append("line").classed("timeline", true).attr("y2", innerHeight);
    timeline
      .append("g")
      .selectAll("circle.dot")
      .data([0, innerHeight])
      .enter()
      .append("circle")
      .classed("dot", true)
      .style("fill", "#dbdbdb")
      .attr("r", 3)
      .attr("cy", (d) => d);

    // Axis range made up of minute intervals
    var axisTicks = Array.from(Array(options.timelineLimit / 30 + 1), (_, i) => {
      return { tick: i * 30, y: timelineScale(i * 30) };
    });

    timeline
      .append("g")
      .attr("id", "ticks")
      .selectAll("text.tick")
      .data(axisTicks)
      .enter()
      .append("text")
      .attr("x", 0)
      .attr("y", (d) => d.y)
      .attr("transform", "translate(-12, 2.5)")
      .attr("text-anchor", "end")
      .classed("tick", true)
      .text((d) => {
        return d.tick % 60 == 0 ? `${d.tick / 60}min` : "-";
      });

    timeline.append("g").attr("id", "markers").classed("markers", true);
    timeline.append("g").attr("id", "labels").classed("labels", true);
    timeline.append("g").attr("id", "links").classed("links", true);

    return {
      svg,
      timelineScale,
    };
  };

  /* ------------------------------ Functions ----------------------------- */

  // Calculate/approximate text width
  // https://stackoverflow.com/a/35373030/3910531
  const BrowserText = (() => {
    var canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");

    const getWidth = (text, fontSize, fontFace) => {
      context.font = fontSize + "px " + fontFace;
      return context.measureText(text).width;
    };

    return {
      getWidth,
    };
  })();

  // Create linear-gradient filter to match each app's background
  createGradientFilter = ({ svg, data }) => {
    var gradient = svg
      .select("defs")
      .append("linearGradient")
      .attr("id", data.id)
      .attr("x1", -1.5)
      .attr("x2", 1.5)
      .attr("y1", -2)
      .attr("y2", 2)
      .attr("gradientTransform", "rotate(-15)");
    var offsetScale = d3.scaleLinear().domain([0, data.colors.length]).range([0, 100]);
    data.colors.forEach((c) => {
      let idx = data.colors.indexOf(c);
      gradient.append("stop").attr("stop-color", c).attr("offset", offsetScale(idx));
    });
  };

  // Update function accommodates data updates
  // https://www.d3indepth.com/enterexit/
  const update = ({ svg, id, shape, data }) => {
    var u = svg.select(id).selectAll(shape).data(data);
    u.enter().append(shape).merge(u);
    u.exit().remove();
    return u;
  };

  // Refresh/update SVG objects
  const draw = ({ svg, nodes, options }) => {
    var renderer = new labella.Renderer({
      nodeHeight: nodes[0].width,
      ...options.labella.renderer,
    });

    // Add x,y,dx,dy to node
    renderer.layout(nodes);

    // Label background
    update({ svg, id: "#labels", shape: "rect", data: nodes })
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y - d.dy / 2)
      .attr("width", (d) => d.data.width + d.dx)
      .attr("height", (d) => d.data.height)
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", (d) => `url(#${d.data.id})`);

    // Text labels
    update({ svg, id: "#labels", shape: "text", data: nodes })
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("transform", (d) => `translate(${d.dx / 2 - 2}, 5)`)
      .text((d) => d.data.name);

    // Label link to axis
    update({ svg, id: "#links", shape: "path", data: nodes })
      .attr("d", (d) => renderer.generatePath(d))
      .style("stroke", (d, _) => d.data.colors[0]);
  };

  /* ======================================================================== */
  /*                                 Timeline                                 */
  /* ======================================================================== */

  window.Timeline = ({ options }) => {
    var timelineElement = null;
    var nodeMap = new Map();
    var { svg, timelineScale } = initTimeline({ options });

    /* ------------------------------ Add data ------------------------------ */

    const add = (d = { id, name, duration, colors }) => {
      if (nodeMap.has(d.id)) return;

      d.width = BrowserText.getWidth(d.name, "12.8", "Inter");
      d.height = 28;

      let node = new labella.Node(timelineScale(d.duration), d.height, d);
      nodeMap.set(d.id, node);

      // Create SVG filter matching the app's background gradient
      createGradientFilter({ svg, data: d });
      svg
        .select("#markers")
        .append("circle")
        .classed("dot", true)
        .style("fill", d.colors[0])
        .attr("r", 3)
        .attr("cy", node.getRoot().idealPos);
    };

    /* -------------------------- Refresh timeline -------------------------- */

    const refresh = () => {
      nodes = Array.from(nodeMap.values());
      var force = new labella.Force(options.labella.force).nodes(nodes).compute();

      draw({ svg, nodes: force.nodes(), options });
    };

    const create = (el) => {
      timelineElement = el;
      refresh();
      d3.select(timelineElement).append(() => svg.node());
    };

    const remove = () => timelineElement.remove();

    return {
      add: (d) => {
        add(d);
        refresh();
      },
      remove,
      refresh,
      create,
    };
  };
})();

var data = [
  {
    id: "gke",
    duration: 5,
    colors: ["#1D4350", "#A43931"],
    name: "Kubernetes Engine",
  },
  {
    id: "compute",
    duration: 120,
    colors: ["#73C8A9", "#373B44"],
    name: "Compute Engine",
  },
  {
    id: "run",
    duration: 128,
    colors: ["#f2709c", "#ff9472"],
    name: "Cloud Run: Managed",
  },
  {
    id: "run-anthos",
    duration: 190,
    colors: ["#FF4E50", "#F9D423"],
    name: "Cloud Run: Anthos",
  },
  {
    id: "standard",
    duration: 202,
    colors: ["#20002c", "#cbb4d4"],
    name: "App Engine: Standard",
  },
  {
    id: "functions",
    duration: 240,
    colors: ["#00C9FF", "#92FE9D"],
    name: "Cloud Functions",
  },
  {
    id: "flexible",
    duration: 320,
    colors: ["#457fca", "#5691c8"],
    name: "App Engine: Flexible",
  },
];

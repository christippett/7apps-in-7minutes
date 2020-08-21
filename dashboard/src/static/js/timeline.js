import * as path from 'https://unpkg.com/d3-path@1?module'
import * as scale from 'https://unpkg.com/d3-scale@2?module'
import * as selection from 'https://unpkg.com/d3-selection@1?module'
import * as shape from 'https://unpkg.com/d3-shape@1?module'
import * as timer from 'https://unpkg.com/d3-timer@1?module'
import * as transition from 'https://unpkg.com/d3-transition@1?module'

const d3 = {
  ...selection,
  ...path,
  ...timer,
  ...scale,
  ...transition,
  ...shape
}

export class Timeline {
  constructor ({
    el,
    items = new Map(),
    opts = {
      margin: { left: 0, right: 0, top: 0, bottom: 0 },
      maxValue: 7 * 60,
      tickInterval: 30
    }
  }) {
    this.el = el
    this.parentNode = el.parentNode
    this.opts = opts
    this.items = items
    this.countdownTimer = null
    this.countdownSeconds = 0

    // Create SVG and add it to the DOM
    this.create()
    this.addResizeHandler()
  }

  get bbox () {
    return this.parentNode.getBoundingClientRect()
  }

  get width () {
    return this.bbox.width
  }

  get innerWidth () {
    return this.width - this.margin.left - this.margin.right
  }

  get height () {
    return this.bbox.height
  }

  get innerHeight () {
    return this.height - this.margin.top - this.margin.bottom
  }

  get margin () {
    return { ...this.opts.margin, left: this.width / 2 + this.opts.margin.left }
  }

  addResizeHandler () {
    // The timeline is hidden on mobile (<768px). If the browser is resized from
    // a state where the timeline was hidden, the timeline will fail to render
    // correctly since it would have been unable to calculate its absolute
    // position relative to other elements on the page.

    // To get around this (albiet niche) issue, we remove the SVG element
    // completely and re-draw it every time the browser is resized.
    const ro = new window.ResizeObserver(() => this.create())
    ro.observe(document.body)
  }

  create () {
    // Create SVG element and attach to DOM, replacing any existing SVG
    // elements if necessary
    this.parentNode.innerHTML = ''
    this.svg = d3
      .select(this.parentNode)
      .append(() => this.drawTimeline().node())
    this.updateTimeline()
  }

  add ({ app, duration }) {
    console.log(`📈 Adding ${app.name} to timeline`)
    const timelineValue = Math.min(duration, this.countdownSeconds)
    const item = {
      id: app.name,
      app,
      position: () => {
        const bbox = document
          .getElementById(`${app.name}`)
          .getBoundingClientRect()
        return {
          source: [this.margin.left, this.timelineScale(timelineValue)],
          target: [
            this.bbox.x >= bbox.x ? 0 : this.width,
            bbox.y + bbox.height / 2 - this.bbox.y
          ]
        }
      },
      linkGenerator: d3
        .linkHorizontal()
        .source(d => d.position().source)
        .target(d => d.position().target)
    }
    this.items.set(app.name, item)
    this.updateTimeline()
  }

  /* Show countdown during deployment ------------------------------------- */

  startCountdown (headstart = 0) {
    d3.select('.countdown .axis line').attr('y2', 0)
    d3.select('.countdown .axis circle').attr('cy', 0)
    this.parentNode.classList.add('is-counting')
    this.countdownTimer = d3.interval(
      ms => this.countdownHandler(ms + headstart),
      100
    )
    d3.timeout(ms => this.stopCountdown(), 7 * 60000 - headstart)
  }

  stopCountdown () {
    this.countdownTimer.stop()
    this.svg.node().classList.remove('is-counting')
  }

  countdownHandler (ms) {
    const value = Math.floor(this.timelineScale(ms / 1000))
    const totalSeconds = Math.floor(ms / 1000)
    this.countdownSeconds = totalSeconds

    // Update countdown clock
    const minutePart = Math.floor(ms / 1000 / 60)
      .toString()
      .padStart(2, '0')
    const secondPart = Math.round((ms / 1000) % 60)
      .toString()
      .padStart(2, '0')
    d3.select('text.clock').text(`${minutePart}:${secondPart}`)

    // Increment axis progress tracker
    d3.select('.countdown line.leader')
      .transition()
      .attr('y2', value)
    d3.select('.countdown circle.leader')
      .transition()
      .attr('cy', value)

    d3.selectAll('.tick')
      .filter(function () {
        return parseInt(this.dataset.value) <= totalSeconds + 5
      })
      .classed('active', true)
  }

  /* Generate base SVG container ------------------------------------------- */

  drawTimeline () {
    const svg = d3
      .create('svg')
      .attr('id', 'timeline')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('width', '100%')
      .attr('height', '100%')

    // Drop-shadow filter
    svg
      .append('defs')
      .append('filter')
      .attr('id', 'shadow')
      .attr('width', '200%')
      .attr('height', '200%')
      .attr('y', '-30%')
      .attr('x', '-30%')
      .append('feDropShadow')
      .attr('dx', 1)
      .attr('dy', 2)
      .attr('stdDeviation', 3)
      .attr('flood-opacity', 0.1)
      .attr('flood-color', '#0a0a0a')

    // Timeline axis (incl. countdown)
    svg
      .append(() => this.axis)
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)

    // Paths that link axis markers to target IFrames
    svg.append('g').classed('links', true)

    // Markers
    svg
      .append('g')
      .classed('markers', true)
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)
    svg.append('g').classed('targets', true)

    return svg
  }

  /* Render Timeline data ----------------------------------------------------- */

  updateTimeline () {
    const nodes = Array.from(this.items.values())

    // Create themed gradient filter for each item
    const gradientOffset = colors =>
      d3
        .scaleLinear()
        .domain([0, colors.length])
        .range([0, 100])

    this.svg
      .select('defs')
      .selectAll('linearGradient.bg')
      .data(nodes)
      .enter()
      .remove()
      .append('linearGradient')
      .classed('bg', true)
      .attr('id', d => `bg-${d.app.name}`)
      .attr('x1', -1.5)
      .attr('x2', 1.5)
      .attr('y1', -2)
      .attr('y2', 2)
      .attr('gradientTransform', 'rotate(-15)')
      .each(function (d) {
        d.app.theme.colors.forEach(c => {
          const idx = d.app.theme.colors.indexOf(c)
          d3.select(this)
            .append('stop')
            .attr('stop-color', c)
            .attr('offset', gradientOffset(idx))
        })
      })

    // Helper function for updating data nodes
    const update = ({ el, tag, nodes }) => {
      const [tagName, className] = tag.split('.')
      const u = this.svg
        .select(el)
        .selectAll(tag)
        .data(nodes, d => d.id)
      let enter = u.enter().append(tagName)
      if (className) {
        enter = enter.classed(className, true)
      }
      u.exit().remove()
      return enter.merge(u)
    }

    // Link axis to IFrames
    update({ el: 'g.links', tag: 'path.link', nodes })
      .attr('data-app', d => d.app.name)
      .attr('stroke', d => `url(#bg-${d.app.name})`)
      .transition()
      .attr('d', d => d.linkGenerator(d))

    // Place markers on axis
    update({ el: 'g.markers', tag: 'circle.source', nodes })
      .attr('fill', d => `url(#bg-${d.app.name})`)
      .attr('cy', d => d.position().source[1])
      .attr('r', 4)

    // Place markers on target
    update({ el: 'g.targets', tag: 'circle.target', nodes })
      .attr('fill', d => `url(#bg-${d.app.name})`)
      .attr('cx', d => d.position().target[0])
      .attr('cy', d => d.position().target[1])
      .attr('r', 4)
  }

  /* Timeline D3 Components ------------------------------------------------ */

  get axis () {
    const axis = d3.create('svg:g').classed('axis', true)
    axis.append('line').attr('y2', this.innerHeight)
    axis
      .selectAll('circle.edge')
      .data([0, this.innerHeight])
      .enter()
      .append('circle')
      .classed('edge', true)
      .classed('origin', d => d === 0)
      .classed('end', d => d === this.innerHeight)
      .attr('data-value', d => d)
      .attr('cy', d => d)
      .attr('r', 3)

    // Add labels to axis at 30 minute intervals
    const tickData = Array.from(
      Array(this.opts.maxValue / this.opts.tickInterval + 1),
      (_, i) => {
        const tick = i * this.opts.tickInterval
        return {
          tick,
          y: this.timelineScale(tick),
          isMajor: tick % 60 === 0,
          isMinor: tick % 60 !== 0
        }
      }
    )

    // Add mask to hide part of the axis behind ticks/labels
    const mask = axis.append('g').classed('mask', true)
    mask
      .selectAll('rect.minor')
      .data(tickData.filter(d => d.isMinor))
      .enter()
      .append('circle')
      .classed('tick', true)
      .classed('minor', true)
      .attr('data-value', d => d.tick)
      .attr('cx', 0)
      .attr('cy', d => d.y)
      .attr('r', 4)
    mask
      .selectAll('rect.major')
      .data(tickData.filter(d => d.isMajor))
      .enter()
      .append('rect')
      .classed('tick', true)
      .classed('major', true)
      .attr('data-value', d => d.tick)
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', 44)
      .attr('height', 18)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('transform', 'translate(-22, -10)')

    // Create separate axis to overlay countdown
    axis.append(() => this.countdown)

    // Add ticks
    const ticks = axis.append('g').classed('ticks', true)
    ticks
      .selectAll('circle.tick')
      .data(tickData.filter(d => d.isMinor))
      .enter()
      .append('circle')
      .classed('tick', true)
      .classed('minor', true)
      .attr('data-value', d => d.tick)
      .attr('cx', 0)
      .attr('cy', d => d.y)
      .attr('r', 3)

    ticks
      .selectAll('text.tick')
      .data(tickData.filter(d => d.isMajor))
      .enter()
      .append('text')
      .classed('tick', true)
      .classed('major', true)
      .attr('data-value', d => d.tick)
      .attr('x', 0)
      .attr('y', d => d.y)
      .attr('transform', 'translate(0, 3)')
      .attr('text-anchor', 'middle')
      .text(d => `${d.tick / 60} min`)

    return axis.node()
  }

  get countdown () {
    const countdown = d3.create('svg:g').classed('countdown', true)
    countdown
      .append('line')
      .classed('leader', true)
      .attr({ x1: 0, y1: 0, x2: 0, y2: 0 })
    countdown
      .append('circle')
      .classed('leader', true)
      .attr('r', 2)
      .attr('cy', 0)
    countdown
      .append('text')
      .classed('clock', true)
      .attr('x', 0)
      .attr('y', 0)
      .attr('transform', 'translate(0, -40)')
      .attr('text-anchor', 'middle')
      .text('00:00')
    return countdown.node()
  }

  get timelineScale () {
    const maxValue = this.opts.maxValue
    const maxLength = this.innerHeight
    return d3
      .scaleLinear()
      .domain([0, maxValue])
      .range([0, maxLength])
  }
}

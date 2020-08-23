import * as path from 'https://unpkg.com/d3-path@1?module'
import * as scale from 'https://unpkg.com/d3-scale@2?module'
import * as selection from 'https://unpkg.com/d3-selection@1?module'
import * as shape from 'https://unpkg.com/d3-shape@1?module'
import * as timer from 'https://unpkg.com/d3-timer@1?module'
import * as transition from 'https://unpkg.com/d3-transition@1?module'
import utils from './utils.js'

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
      maxValue: 3 * 60,
      tickInterval: 15
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
      .append(() => this.renderTimeline().node())
    this.updateTimeline()
  }

  add ({ app, duration, color }) {
    console.log(`📈 Adding ${app.title} to timeline`)
    const timelineValue = Math.min(duration, this.countdownSeconds)
    const item = {
      id: app.id,
      app,
      duration,
      color,
      position: () => {
        const bbox = document
          .getElementById(`${app.id}`)
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
    this.items.set(app.id, item)
    this.updateTimeline()
  }

  /* Show countdown during deployment ------------------------------------- */

  startCountdown (headstart = 0) {
    d3.select('.countdown .axis line').attr('y2', 0)
    d3.select('.countdown .axis circle').attr('cy', 0)
    this.parentNode.classList.add('show-countdown')
    this.countdownTimer = d3.interval(
      ms => this.countdownHandler(ms + headstart),
      100
    )
    d3.timeout(ms => this.stopCountdown(), 7 * 60000 - headstart)
  }

  stopCountdown () {
    try {
      this.countdownTimer.stop()
    } catch {}
  }

  resetCountdown () {
    this.parentNode.classList.remove('show-countdown')
    this.setClock(0)
    this.items.clear()
    this.create()
  }

  countdownHandler (ms) {
    const value = Math.floor(this.timelineScale(ms / 1000))
    const totalSeconds = Math.floor(ms / 1000)
    this.countdownSeconds = totalSeconds

    // Update clock
    this.setClock(ms)

    // Increment axis progress tracker
    d3.select('.countdown line.leader')
      .transition()
      .attr('y2', value)
    d3.select('.countdown circle.leader')
      .transition()
      .attr('cy', value)

    const actionInterval = this.timelineScale(3)
    const scale = this.timelineScale
    d3.selectAll('.tick').classed('active', function () {
      const tick = scale(this.dataset.value)
      return tick - actionInterval <= value
    })
  }

  setClock (ms) {
    // Update countdown clock
    const timePart = utils.timePart(ms)
    d3.select('text.clock').text(`${timePart.minute}:${timePart.second}`)
  }

  /* Generate base SVG container ------------------------------------------- */

  renderTimeline () {
    const svg = d3
      .create('svg')
      .attr('id', 'timeline')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('width', '100%')
      .attr('height', '100%')

    // Drop-shadow filter
    const defs = svg.append('defs')
    defs
      .append('filter')
      .attr('id', 'blur')
      .append('feGaussianBlur')
      .attr('stdDeviation', 1)
      .attr('in', 'SourceGraphic')
    const shadow = defs
      .append('filter')
      .attr('id', 'shadow')
      .attr('width', '200%')
      .attr('height', '200%')
      .attr('y', '-50%')
      .attr('x', '-50%')
    shadow
      .append('feDropShadow')
      .attr('dx', 1)
      .attr('dy', 1)
      .attr('stdDeviation', 0)
      .attr('flood-opacity', 1)
      .attr('flood-color', '#000000')

    const axis = svg
      .append('g')
      .classed('axis', true)
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)
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
    axis
      .append('g')
      .classed('masks', true)
      .selectAll('circle.tick')
      .data(this.tickValues)
      .enter()
      .append('circle')
      .classed('tick', true)
      .classed('minor', d => d.isMinor)
      .classed('major', d => d.isMajor)
      .attr('data-value', d => d.tick)
      .attr('cx', 0)
      .attr('cy', d => d.y)
      .attr('r', 4)

    svg
      .append('text')
      .classed('clock', true)
      .attr('x', 0)
      .attr('y', 0)
      .attr('transform', `translate(${this.margin.left}, -20)`)
      .attr('text-anchor', 'middle')
      .text('00:00')

    const ticksLayer1 = this.renderTicks(svg)
      .classed('layer-1', true)
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)

    this.renderCountdown(svg).attr(
      'transform',
      `translate(${this.margin.left}, ${this.margin.top})`
    )

    ticksLayer1
      .clone(true)
      .raise()
      .classed('layer-1', false)
      .classed('layer-2', true)
      .selectAll('circle')

    // Paths that link axis markers to target IFrames
    svg.append('g').classed('items', true)

    this.renderLabels(svg).attr(
      'transform',
      `translate(${this.margin.left}, ${this.margin.top})`
    )

    return svg
  }

  /* Render Timeline data ----------------------------------------------------- */

  updateTimeline () {
    const nodes = Array.from(this.items.values())

    // Helper function for updating data nodes
    const update = (root, { el, tag, nodes }) => {
      const [tagName, className] = tag.split('.')
      const u = root
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

    const itemGroup = update(this.svg, { el: 'g.items', tag: 'g.item', nodes })

    // Background elements
    const bg = itemGroup.append('g').classed('bg', true)
    bg.append('path')
      .classed('link', true)
      .attr('d', d => d.linkGenerator(d))
    bg.append('circle')
      .classed('target', true)
      .attr('cx', d => d.position().target[0])
      .attr('cy', d => d.position().target[1])
      .attr('r', 5)
    bg.append('circle')
      .classed('source', true)
      .attr('cy', d => d.position().source[1])
      .attr('r', 4)
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)

    // Foreground elements
    const fg = itemGroup.append('g').classed('fg', true)
    fg.append('circle')
      .classed('target', true)
      .attr('fill', d => d.color)
      .attr('cx', d => d.position().target[0])
      .attr('cy', d => d.position().target[1])
      .attr('r', 5)
    fg.append('circle')
      .classed('source', true)
      .attr('fill', d => d.color)
      .attr('cy', d => d.position().source[1])
      .attr('r', 4)
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)
    fg.append('path')
      .classed('link', true)
      .attr('stroke', d => d.color)
      .attr('d', d => d.linkGenerator(d))
  }

  /* Timeline D3 Components ------------------------------------------------ */

  renderTicks (parent) {
    const group = parent.append('g').classed('ticks', true)
    group
      .selectAll('circle.tick')
      .data(this.tickValues)
      .enter()
      .append('circle')
      .classed('tick', true)
      .classed('minor', d => d.isMinor)
      .classed('major', d => d.isMajor)
      .attr('data-value', d => d.tick)
      .attr('cx', 0)
      .attr('cy', d => d.y)
      .attr('r', d => (d.isMajor ? 6 : 4))
    return group
  }

  renderLabels (parent) {
    const labels = parent
      .append('g')
      .classed('labels', true)
      .selectAll('g.tick')
      .data(this.tickValues)
      .enter()
      .append('g')
      .classed('tick', true)
      .classed('minor', d => d.isMinor)
      .classed('major', d => d.isMajor)
      .attr('data-value', d => d.tick)
    labels
      .append('rect')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', 50)
      .attr('height', 18)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('transform', 'translate(-25, -9)')
    labels
      .append('text')
      .attr('x', 0)
      .attr('y', d => d.y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text(d => `${d.tick / 60} min`)
    return labels
  }

  renderCountdown (parent) {
    const countdown = parent.append('g').classed('countdown', true)
    countdown
      .append('line')
      .classed('leader', true)
      .attr({ x1: 0, y1: 0, x2: 0, y2: 0 })
    countdown
      .append('circle')
      .classed('leader', true)
      .attr('r', 2)
      .attr('cy', 0)
    return countdown
  }

  get tickValues () {
    return Array.from(
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

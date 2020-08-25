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
      maxValue: 195,
      tickInterval: 15
    }
  }) {
    this.parentNode = el
    this.opts = opts
    this.items = items
    this.itemColours = [
      '#ea4335',
      '#fbbc05',
      '#33b1b6',
      '#34a853',
      '#f18238',
      '#4285f4',
      '#cf64c6'
    ]

    this.countdownTimer = null
    this.countdownResetId = null

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
    const svg = d3
      .select('#timeline')
      .selectAll('svg')
      .data([1])
      .enter()
      .append('svg:svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
    svg.append(() => this.drawFilters().node())
    svg.append(() => this.drawTimeline().node())
    this.drawDataItems()
  }

  add ({ app, duration }) {
    const item = {
      id: app.id,
      app,
      duration,
      position: () => {
        const bbox = document
          .getElementById(`${app.id}`)
          .getBoundingClientRect()
        return {
          source: [this.margin.left, this.timelineScale(duration)],
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
    this.items.set(app.id, { ...item })
    this.drawDataItems()
  }

  /* Show countdown during deployment ------------------------------------- */

  startCountdown (startTime) {
    d3.select('.countdown .axis line').attr('y2', 0)
    d3.select('.countdown .axis circle').attr('cy', 0)
    this.parentNode.classList.add('show-countdown')
    this.countdownTimer = d3.interval(
      ms => this.countdownHandler(startTime),
      100
    )
    const finishTime = new Date(+startTime + 7 * 60000)
    d3.timeout(ms => this.stopCountdown(), finishTime - new Date())
  }

  stopCountdown () {
    try {
      this.countdownTimer.stop()
    } catch {}
    if (!this.countdownResetId) {
      this.countdownResetId = setTimeout(() => {
        this.resetCountdown()
      }, 60000)
    }
  }

  resetCountdown () {
    this.parentNode.classList.remove('show-countdown')
    d3.selectAll('.tick.active').classed('active', false)
    this.setClock(0)
    this.items.clear()
    this.create()
  }

  countdownHandler (startTime) {
    const ms = Math.abs(new Date() - startTime)
    const value = Math.floor(this.timelineScale(ms / 1000))

    // Update clock
    this.setClock(ms)

    // Increment axis progress tracker
    d3.select('.countdown line.leader')
      .transition()
      .attr('y2', value)
    d3.select('.countdown circle.leader')
      .transition()
      .attr('cy', value)

    const scale = this.timelineScale
    d3.selectAll('.tick').classed('active', function () {
      const tick = scale(this.dataset.value - 0.25)
      return tick <= value
    })
  }

  setClock (ms) {
    // Update countdown clock
    const pad = v => v.toString().padStart(2, '0')
    const { minute, second } = utils.timePart(ms)
    const clock = `${pad(minute)}:${pad(second)}`
    d3.select('text.clock').text(clock)
  }

  /* Generate base SVG container ------------------------------------------- */

  drawTimeline () {
    const timeline = d3
      .create('svg:g')
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)
    const axisTicks = this.drawAxisTicks()
    timeline.append(() => this.drawTimer().node())
    timeline.append(() => this.drawAxis().node())
    timeline.append(() => axisTicks.clone(true).node())
    timeline.append(() => this.drawCountdown().node())
    timeline.append(() => axisTicks.clone(true).node()).classed('overlay', true)
    timeline
      .append('svg:g')
      .classed('items', true)
      .attr('transform', `translate(${this.margin.left * -1}, 0)`)
    timeline.append(() => this.drawLabels().node())
    return timeline
  }

  /* Timeline D3 Components ------------------------------------------------ */

  drawDataItems () {
    const nodes = Array.from(this.items.values()).sort((a, b) =>
      a.duration < b.duration ? -1 : 0
    )
    const parent = d3
      .select('#timeline svg g.items')
      .selectAll('g.item')
      .data(nodes, d => d.id)
    const items = parent
      .enter()
      .append('svg:g')
      .classed('item', true)
      .attr('data-app', d => d.id)
      .attr('data-duration', d => d.duration)
    parent.exit().remove()

    // Background elements
    const bg = items.append('svg:g').classed('bg', true)
    bg.append('svg:path')
      .classed('link', true)
      .attr('d', d => d.linkGenerator(d))
    bg.append('svg:circle')
      .classed('target', true)
      .attr('cx', d => d.position().target[0])
      .attr('cy', d => d.position().target[1])
      .attr('r', 5)
    bg.append('svg:circle')
      .classed('source', true)
      .attr('cy', d => d.position().source[1])
      .attr('cx', this.margin.left)
      .attr('r', 4)

    // Foreground elements
    const getColour = id => {
      const i = [...this.items.keys()].indexOf(id)
      return this.itemColours[i]
    }
    items
      .append('svg:circle')
      .classed('target', true)
      .attr('fill', d => getColour(d.id))
      .attr('cx', d => d.position().target[0])
      .attr('cy', d => d.position().target[1])
      .attr('r', 5)
    items
      .append('svg:circle')
      .classed('source', true)
      .attr('fill', d => getColour(d.id))
      .attr('cx', this.margin.left)
      .attr('cy', d => d.position().source[1])
      .attr('r', 4)
    items
      .append('svg:path')
      .classed('link', true)
      .attr('stroke', d => getColour(d.id))
      .attr('d', d => d.linkGenerator(d))

    items.merge(parent)
  }

  drawTimer () {
    const root = d3
      .create('svg:g')
      .classed('timer', true)
      .attr('transform', 'translate(0, -20)')
    root
      .append('text')
      .classed('clock', true)
      .attr('x', 0)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .text('00:00')
    return root
  }

  drawAxis () {
    const axis = d3.create('svg:g').classed('axis', true)
    axis.append('line').attr('y2', this.innerHeight)
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
    return axis
  }

  drawAxisTicks () {
    const ticks = d3.create('svg:g').classed('ticks', true)
    ticks
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
      .attr('r', d => (d.isMajor ? 5 : 4))
    return ticks
  }

  drawLabels () {
    const root = d3.create('svg:g').classed('labels', true)
    const labels = root
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
      .text(d => {
        let { minute, second } = utils.timePart(d.tick * 1000)
        minute = parseInt(minute)
        second = parseInt(second)
        if (second === 0) {
          return `${minute} min`
        } else if (minute === 0) {
          return `${second} sec`
        }
        return `${minute}m ${second}s`
      })
    return root
  }

  drawCountdown () {
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
    return countdown
  }

  drawFilters () {
    const defs = d3.create('svg:defs')
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
    return defs
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

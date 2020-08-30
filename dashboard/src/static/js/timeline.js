import { scaleLinear } from 'd3-scale'
import { create, select, selectAll } from 'd3-selection'
import { linkHorizontal } from 'd3-shape'
import { interval, now, timeout, timer } from 'd3-timer'
import { transition } from 'd3-transition'
import utils from './utils.js'

const d3 = {
  scaleLinear,
  now,
  timeout,
  timer,
  interval,
  linkHorizontal,
  select,
  selectAll,
  create,
  transition
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
    this.parentNode.innerHTML = ''
    const svg = d3
      .select(this.parentNode)
      .append('svg:svg')
      .attr('height', '100%')
      .attr('width', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
    svg.append(() => this.drawFilters().node())
    svg.append(() => this.drawTimeline().node())
    this.drawDataItems()
  }

  add ({ app, timer }) {
    const item = {
      id: app.id,
      app,
      duration: timer.duration,
      position: () => {
        const bbox = document
          .getElementById(`${app.id}`)
          .getBoundingClientRect()
        return {
          source: [this.margin.left, this.timelineScale(timer.duration)],
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
    d3.select('#timeline').classed('show-countdown', true)
    const offset = new Date() - startTime
    const countdownStart = d3.now()
    this.countdownTimer = d3.timer(ms => {
      this.countdownHandler({ ms, offset, startTime, countdownStart })
    })
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

  countdownHandler ({ ms, offset, startTime, countdownStart }) {
    const elapsed = ms + offset
    const value = this.timelineScale(elapsed / 1000)

    // Update clock
    this.setClock(elapsed)

    // Increment axis progress tracker
    const t = d3
      .transition('axis')
      .delay(0)
      .duration(0)
    d3.select('.countdown line.leader')
      .transition(t)
      .attr('y2', value)
    d3.select('.countdown circle.leader')
      .transition(t)
      .attr('cy', value)

    const scale = this.timelineScale
    d3.selectAll('.tick').classed('active', function () {
      const tick = scale(this.dataset.value)
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
      .datum(d => {
        const link = d.linkGenerator(d)
        const path = d3
          .create('svg:path')
          .attr('d', link)
          .node()
        return {
          ...d,
          link,
          length: path.getTotalLength()
        }
      })
    parent.exit().remove()

    // Transitions
    const sourceTransition = d3
      .transition('source')
      .delay(0)
      .duration(500)
    const targetTransition = d3
      .transition('target')
      .delay(2500)
      .duration(500)
    const linkTransition = d3
      .transition('item-path')
      .delay(250)
      .duration(2500)

    // Background elements
    const bg = items.append('svg:g').classed('bg', true)
    bg.append('svg:path')
      .classed('link', true)
      .attr('d', d => d.link)
      .attr('stroke-dasharray', d => `${d.length} ${d.length}`)
      .attr('stroke-dashoffset', d => d.length)
      .transition(linkTransition)
      .attr('stroke-dashoffset', 0)
    bg.append('svg:circle')
      .classed('target', true)
      .attr('cx', d => d.position().target[0])
      .attr('cy', d => d.position().target[1])
      .attr('r', 0)
      .transition(targetTransition)
      .attr('r', 5)
    bg.append('svg:circle')
      .classed('source', true)
      .attr('cy', d => d.position().source[1])
      .attr('cx', this.margin.left)
      .attr('r', 0)
      .transition(sourceTransition)
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
      .attr('r', 0)
      .transition(targetTransition)
      .attr('r', 5)
    items
      .append('svg:circle')
      .classed('source', true)
      .attr('fill', d => getColour(d.id))
      .attr('cx', this.margin.left)
      .attr('cy', d => d.position().source[1])
      .attr('r', 0)
      .transition(sourceTransition)
      .attr('r', 4)
    items
      .append('svg:path')
      .classed('link', true)
      .attr('stroke', d => getColour(d.id))
      .attr('d', d => d.link)
      .attr('stroke-dasharray', d => `${d.length} ${d.length}`)
      .attr('stroke-dashoffset', d => d.length)
      .transition(linkTransition)
      .attr('stroke-dashoffset', 0)

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

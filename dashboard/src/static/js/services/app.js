import utils from '../utils.js'

export class ApplicationService {
  constructor ({ apps, themes, timeline, notificationService }) {
    this.activePolls = new Map()
    this.apps = new Map(apps.map(app => [app.id, app]))
    this.themes = themes
    this.timeline = timeline
    this.builds = new Map()

    // Setup apps + event listeners
    this.apps.forEach(app => {
      const { iframe } = this.getPageElements(app)
      iframe.addEventListener('load', event =>
        this.iframeLoadEventHandler(event)
      )
      this.refreshIframe(app)
    })
    // Setup IFrame message handler
    window.addEventListener(
      'message',
      event => this.iframeMessageReceiver(event),
      false
    )
    // Refresh IFrame if requested by backend
    notificationService.subscribe('refresh-app', message => {
      this.refreshIframe(message.data.app)
    })
    // Update Timeline when app updated
    notificationService.subscribe('app-updated', message => {
      const { app, duration } = message.data
      this.refreshIframe(app)
      this.timeline.add({ app, duration })
    })
    // Stop Timeline when build finished
    notificationService.subscribe('build', message => {
      if (message.data.status === 'finished') {
        this.timeline.stopCountdown()
      }
    })
  }

  getRandomTheme () {
    const theme = this.themes[utils.randomNumber(this.themes.length)]
    return theme
  }

  getPageElements (app) {
    const el = document.getElementById(app.id)
    return {
      el,
      iframe: el.getElementsByTagName('iframe')[0]
    }
  }

  iframeLoadEventHandler (event) {
    const iframe = event.target
    const el = iframe.parentNode
    const app = this.apps.get(el.id)

    // The TimeoutID from below is messaged to the IFrame, which should then
    // echo back the message in time for `iframeMessageReceiver` to receive it
    // and cancel its execution (if the IFrame is responsive/working)
    const timeoutId = setTimeout(() => {
      if (!el.dataset.error) {
        el.dataset.error = true
        setTimeout(() => this.refreshIframe(app), 5000)
      }
    }, 1000)
    const origin = new URL(iframe.src).origin
    iframe.contentWindow.postMessage({ timeoutId }, origin)
  }

  iframeMessageReceiver (event) {
    const timeoutId = event.data.timeoutId
    const app = event.data.app
    const { el } = this.getPageElements(app)
    if (el.hasAttribute('data-error')) {
      el.removeAttribute('data-error')
    }
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }
    if (app) {
      this.update(app, true)
    }
  }

  refreshIframe (app) {
    const { iframe } = this.getPageElements(app)
    if (iframe) {
      iframe.setAttribute('src', `${app.url}?ts=${+new Date()}`)
      iframe.setAttribute('name', `${app.id}-${app.version}`)
    }
  }

  update (data) {
    const app = this.apps.get(data.id) || {}
    if (data.version !== app.version) {
      this.apps.set(app.id, {
        ...app,
        ...data,
        updated: new Date(data.updated) || new Date()
      })
      if (this.builds.has(data.version)) {
        const { el } = this.getPageElements(app)
        el.classList.add('has-new-version')
        setTimeout(() => el.classList.remove('has-new-version'), 5000)
      }
    }
  }

  registerBuild (build) {
    this.builds.set(build.version, build)
  }

  async fetchApp (url) {
    // The app is configured to return a copy of its configuration as JSON
    const resp = await window.fetch(url, {
      cache: 'no-cache',
      headers: { Accept: 'application/json' }
    })
    if (!resp.ok) {
      return { error: resp.statusText, app: null }
    }
    const app = await resp.json()
    return { error: null, app }
  }

  async deploy ({ data }) {
    const resp = await window.fetch('/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!resp.ok && resp.status !== 409) {
      throw new Error(`${resp.statusText} (${resp.status})`)
    }
    const { id, version, createTime } = await resp.json()
    const build = {
      id,
      version,
      createTime: new Date(createTime)
    }
    this.registerBuild(build)
    return { build, status: resp.status }
  }

  // async startPoll (version) {
  //   if (this.pollingStatus === PollingStatus.Active) {
  //     console.debug('☝️ Poll already in-progress')
  //     return
  //   }
  //   console.log(`🚰 Polling applications for version ${version}`)
  //   var apps = Array.from(this.apps.keys())
  //   this.pollingStatus = PollingStatus.Active
  //   setTimeout(() => (this.pollingStatus = PollingStatus.Inactive), 600 * 1000)
  //   while (this.pollingStatus === PollingStatus.Active) {
  //     if (apps.length === 0) {
  //       console.log(`🛁 All applications updated to version ${version}`)
  //       this.pollingStatus = PollingStatus.Inactive
  //       return
  //     }
  //     apps.slice(0).forEach(id => {
  //       const app = this.apps.get(id)
  //       if (app.version === version) {
  //         console.log(`🕹️ ${app.title} has updated to version ${version}`)
  //         apps.splice(apps.indexOf(id), 1)
  //       } else {
  //         app.iframe.src = app.iframe.src.split('?')[0] + `?ts=${+new Date()}`
  //       }
  //     })
  //     await utils.sleep(20000)
  //   }
  // }
}

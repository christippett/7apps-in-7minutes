/* eslint-disable no-unused-expressions */

import { ApplicationService } from './services/app.js'
import { CommentService } from './services/comment.js'
import { LogService } from './services/log.js'
import { NotificationService } from './services/notification.js'
import { Timeline } from './timeline.js'
import utils from './utils.js'

const props = window.props
const notificationService = new NotificationService()
const timeline = new Timeline({
  el: document.getElementById('timeline')
})
const comment = new CommentService({
  el: document.getElementById('commentary')
})
const logger = new LogService({
  el: document.getElementById('logs'),
  notificationService
})
const app = new ApplicationService({
  apps: props.apps,
  themes: props.themes,
  timeline,
  notificationService
})

// Debug WebSocket
window.ns = notificationService
notificationService.subscribe('echo', message =>
  comment.add({ text: message.data.text })
)

notificationService.subscribe('app-updated', message => {
  const { app, duration } = message.data
  const { minute, second } = utils.timePart(duration * 1000)
  const time = [
    minute ? `${minute} minutes` : '',
    second ? `${second} seconds` : ''
  ]
  comment.add({
    text: `<p><span class='is-fancy'>${
      app.title
    }</span> updated in <strong><em>${time.join(', ')}</em></strong></p>`,
    style: 'success'
  })
})
;(() => {
  window.demo = function () {
    const data = {
      ...props,
      isFullscreen: false,
      isLoading: false,
      isDeploying: false,
      theme: 0
    }

    const methods = {
      toggleFullscreen () {
        this.isFullscreen = !this.isFullscreen
      },
      selectTheme (index) {
        const [min, max] = [0, this.themes.length - 1]
        this.theme = index < min ? max : index > max ? min : index
        this.updateThemeStyle()
      },
      selectedTheme () {
        return this.themes[this.theme]
      },
      updateThemeStyle () {
        const theme = this.selectedTheme()
        const colors = theme.colors.join(',')
        document.getElementById('theme').innerHTML = `
          .theme {
            background: ${colors[0]};
            background: linear-gradient(45deg,${colors}) 0% 0% / 400% 400%;
          }
          .theme.title {
            font-family: '${theme.font}';
          }
        `
      },
      showLogs () {
        return this.isDeploying && !this.isLoading
      },
      async deploy () {
        this.isLoading = true
        try {
          var { build, status } = await app.deploy({
            data: this.selectedTheme()
          })
        } catch (e) {
          comment.add({ text: e, style: 'danger' })
          this.isLoading = false
          return false
        }

        logger.getLogs(build.id)
        timeline.startCountdown(build.createTime)
        this.build = build
        this.isDeploying = true
        this.isLoading = false

        setTimeout(() => {
          this.theme = Math.floor(
            Math.random() * Math.floor(this.themes.length)
          )
        }, 10000)

        const logComment = {
          text: [
            '<p>The stream of text you see in the box above are the logs output by Cloud Build.</p>',
            '<p>You can check out the steps used to deploy each app, along with the source code for everything on ',
            "<a href='https://github.com/servian/7apps-google-cloud/blob/demo/app/cloudbuild.yaml'><strong>GitHub</strong></a>.</p>"
          ].join(''),
          style: 'info'
        }

        if (status === 409) {
          const message = [
            '<p>It seems a another deployment is already in-progress. Give it a minute or two <em>(or seven)</em> and try again.</p>',
            "<p>In the meantime, let's check out what's happening with the current deployment.</p>"
          ].join('')
          comment.queue({
            messages: [message, logComment],
            style: 'warning'
          })
        } else {
          const message = [
            '<span class="is-fancy">Woohoo!</span> You just triggered a new <strong>Cloud Build</strong> job! ',
            `Keep an eye out for the version <span class="is-family-monospace">${build.version}</span>, that's yours!`
          ].join('')
          comment.queue({ messages: [message, logComment], style: 'success' })
        }
      }
    }

    return {
      ...data,
      ...methods
    }
  }
})()

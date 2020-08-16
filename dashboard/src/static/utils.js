(function () {
  "use strict";
  const utils = (() => {
    return {
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    };
  })();

  /* Websocket Notification Service ----------------------------------------- */

  class NotificationService {
    constructor() {
      const scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
      const webSocketUri =
        scheme +
        window.location.hostname +
        (location.port ? ":" + location.port : "") +
        "/ws";
      this.websocket = this.connect(webSocketUri);
      this.subscriptions = new Map();
    }

    connect(uri) {
      // We rely on websockets to send events from the backend to the client.
      const websocket = new WebSocket(uri);
      websocket.onopen = () => console.log("🔌 Websocket connected");
      websocket.onerror = () => console.error("💥 Error connecting to websocket");
      websocket.onclose = () => {
        console.log("🔌 Websocket disconnected");
        setTimeout(() => this.connect(uri), 20000);
      };
      // I've created a poor-man's pub/sub where various parts of the front-end
      // can subscribe to specific event topics that trigger actions via
      // callbacks
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const subscriptions = this.getTopicSubscriptions(message.topic);
        subscriptions.forEach((callback) => callback(message));
      };
      return websocket;
    }

    addSubscription(topic, callback) {
      var subscriptions = this.getTopicSubscriptions(topic);
      subscriptions.push(callback);
      this.subscriptions.set(topic, subscriptions);
    }

    getTopicSubscriptions(topic) {
      return this.subscriptions.get(topic) || [];
    }
  }

  /* Application Service ---------------------------------------------------- */

  class AppService {
    constructor() {
      this.subscriptions = new Array();
      this.latestVersion = null;
      this.lastUpdated = new Date(1990, 1, 1);
      this._apps = new Map();
      this._activePolls = new Map();
    }

    get apps() {
      return Array.from(this._apps.values()).map((app) => {
        return {
          isLatestVersion: this.latestVersion === app.version,
          ...app,
        };
      });
    }

    addApps({ apps }) {
      apps.map((app) => {
        this._apps.set(app.name, app);
      });
    }

    addSubscription(callback) {
      this.subscriptions.push(callback);
    }

    async fetchApp(url) {
      // The app is configured to return a copy of its configuration as JSON
      // when we use the appropriate Accept header
      let resp = await fetch(url, {
        cache: "no-cache",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) {
        return { error: resp.statusText, app: null };
      }
      let app = await resp.json();
      return { error: null, app };
    }

    async refreshApp({ app, duration }) {
      // Rather than having every client poll each app separately, the backend
      // takes care of this for us and broadcasts a notification once an app has
      // been updated. This is the function that's triggered on the back of that
      // notification.  The function checks the app to make sure it matches the
      // expected version and then refreshes its <iframe> container so the new
      // version is visible.

      //  Validate the latest version is newer than the last
      let updated = new Date(app.updated);
      if (updated > this.lastUpdated) {
        this.latestVersion = app.version;
        this.lastUpdated = updated;
      }

      // Duplicate notifications may trigger this function more than once
      if (this._activePolls.get(app.name)) {
        console.debug(`☝️ Refresh already in progress for ${app.name}`);
        return;
      }

      console.log(`🚰 Refreshing ${app.title} (expecting version ${this.latestVersion})`);
      this._activePolls.set(app.name, true);
      const el = document.getElementById(app.name);
      const iframe = el.getElementsByTagName("iframe")[0];
      const mask = el.getElementsByClassName("mask")[0];

      // You can never have too many emojis... I'm using these to provide a bit
      // of colour when logging to the console
      const icons = ["😅", "🤔", "🤨", "😬", "🤢"];

      // Although the backend has confirmed the app is updated, it may take a
      // few attempts before the client sees the new version
      var count = 0;
      while (this._activePolls.get(app.name)) {
        // Get a bunch of properties from the app as JSON
        let resp = await this.fetchApp(iframe.src);

        if (resp.error) {
          // If there's an error with the app, we mask the iframe's contents and
          // provide feedback to the user
          iframe.setAttribute("data-error", true);
          mask.classList.remove("is-hidden");
          mask.getElementsByClassName("notice")[0].innerHTML = resp.error;
        } else if (iframe.dataset.error) {
          // Remove the mask covering the iframe if there was an error in a
          // previous iteration that's no longer relevant
          iframe.removeAttribute("data-error");
          mask.classList.add("is-hidden");
          mask.getElementsByClassName("notice")[0].innerHTML = app.title;
        }

        // Check whether the version returned by the client matches the latest
        // version sent by the backend
        if (resp.app && resp.app.version === this.latestVersion) {
          this._activePolls.delete(app.name);

          // Update local copy of the app
          app = { ...app, ...resp.app };
          this._apps.set(app.name, app);

          // Update elements that reference the app's properties
          el.dataset.version = app.version;
          el.dataset.title = app.title;
          iframe.name = `${iframe.name.split("-")[0]}-${app.version}`;
          iframe.src = `${app.url}?ts=${updated}`;

          // Send notification to client-side subscribers that the app has been
          // updated. This is used to update the SVG for the timeline and to
          // provide feedback to the user
          this.subscriptions.forEach((callback) => callback({ app, duration }));

          // Make the iframe jiggle
          el.classList.add("has-new-version");
          setTimeout(() => el.classList.remove("has-new-version"), 3000);

          return;
        }

        // If for whatever reason we can't reconcile the app's version after 6
        // attempts - we call it quits
        count++;
        if (count >= 6) {
          this._activePolls.delete(app.name);
          console.error(
            `🥵 Failed to get latest version for ${app.title} (expecting ${this.latestVersion}, got ${app.version})`
          );
          return;
        }

        await utils.sleep(10000);
        console.debug(`${icons[count - 1]} Still refreshing ${app.title}...`);
      }
    }

    async deployUpdate({ gradient, asciiFont, font }) {
      // It's a Python backend, so snake-case rules
      let payload = { gradient, font, ascii_font: asciiFont };

      return await fetch("/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  }

  /* Cloud Build L̶o̶g̶ Colour Handler ----------------------------------------- */

  class LogHandler {
    constructor(container) {
      this.container = container;
    }

    createLogRecord(data) {
      // This function would be a lot simpler if I'd stuck to just showing
      // monospace white text on a black background...
      let el = document.createElement("p");

      // The data attributes are used to apply specific CSS styles based on
      // the log's content
      el.setAttribute("data-id", data.id || "");
      el.setAttribute("data-step", data.step || "");
      if (data.type) {
        el.setAttribute("data-type", data.type.toLowerCase());
      }

      // Add a prefix that highlights the step the log corresponds to
      // e.g. "Step #10 - gae-standard --->"
      if (data.step && data.id) {
        let step = document.createElement("span");
        step.setAttribute("class", "lg-step");
        step.innerText = `Step #${data.step}`.padEnd(8);
        el.appendChild(step);

        let id = document.createElement("span");
        id.setAttribute("class", "lg-id");
        id.innerText = data.id;
        el.appendChild(id);
      }

      // Every log has a text component, otherwise what's the point?
      let message = document.createElement("span");
      message.setAttribute("class", "lg-text");
      message.innerText = data.text;
      el.appendChild(message);

      this.container.appendChild(el);
      this.container.scrollTop = this.container.scrollHeight;
    }

    flushLogs() {
      this.container.innerHTML = "";
    }
  }

  /* Tooltip Controller ------------------------------------------------------ */

  class Tooltip {
    constructor() {
      this._tooltips = [];
      this.styles = ["primary", "link", "success", "info", "warning", "danger"];
    }

    get tooltips() {
      return this._tooltips;
    }

    add({ text, style = "info", wait = 0, timeout = 12000 } = {}) {
      let id = +new Date();
      let tooltip = { id, text, style, wait, timeout, active: true };
      setTimeout(() => this._tooltips.push(tooltip), wait);
      if (timeout > 0) {
        setTimeout(() => this.close(tooltip), timeout + wait);
      }
      return id;
    }

    queue({ messages = [], timeout = 12000, wait = 1000, style = "info" } = {}) {
      var timer = timeout + wait;
      messages.forEach((msg, index) => {
        let tooltip = typeof msg === "string" ? { text: msg } : msg;
        setTimeout(() => this.add({ style, timeout, ...tooltip }), timer * index);
      });
    }

    close(tooltip) {
      tooltip.active = false;
      setTimeout(() => this._tooltips.splice(this._tooltips.indexOf(tooltip), 1), 1000);
      console.log();
    }

    reset() {
      this._tooltips.forEach((tooltip) => {
        if (tooltip.active) {
          this.close(tooltip);
        }
      });
    }

    getClass(tooltip) {
      let cls = {};
      cls[`has-background-${tooltip.style}-light`] = true;
      cls[`has-text-${tooltip.style}-dark`] = true;
      return cls;
    }
  }

  class AppBuilder {
    constructor({ appService, logHandler, notifier, timeline }) {
      this.activeBuild = null;
      this.appService = appService;
      this.logHandler = logHandler;
      this.notifier = notifier;
      this.timeline = timeline;

      // Create skeleton timeline
      this.timeline.create();

      // When there's an active build in-progress, the backend will send log
      // messages that will be processed by the `LogHandler` and added to the
      // DOM
      this.notifier.addSubscription("log", (message) =>
        this.logHandler.createLogRecord(message.data)
      );
    }

    init({ externalRef }) {
      Object.assign(this, externalRef);
      WebFont.load({ google: { families: this.fonts } });
      this.tooltip.add({
        text:
          "Pick a theme, click <span class='is-fancy'>Deploy</span> and then sit back, relax and let <strong>Cloud Build</strong> do the rest.",
        timeout: 0,
      });
    }

    addUpdateHandler() {
      console.log("🗞️ Subscribing to app update events");
      this.notifier.addSubscription("refresh-app", (message) => {
        let app = message.data.app;
        let build = message.data.build;

        console.log(`🕹️ ${app.title} has been updated to version ${app.version}`);
        this.tooltip.add({
          text: `<span class='is-fancy'>${app.title}</span> has been updated to version <span class="is-family-monospace">${app.version}</span>`,
          style: "success",
          timeout: 6000,
        });

        // Add the updated application to the timeline
        console.log(`📈 Adding ${app.name} to timeline`);
        this.timeline.push({
          id: app.name,
          label: app.title,
          theme: app.theme,
          value: duration,
        });

        // Because App Engine: Flexible takes such a long time to update,
        // there's a period of time where there's no new logs. This can be a
        // little disconverting, so we add a bit of commentary to set
        // expectations.
        let oldApps = this.appService.apps.filter((app) => !app.isLatestVersion);
        if (oldApps.length == 1 && oldApps.map((a) => a.name).includes("flex")) {
          let messages = [
            "Just waiting on <span class='is-fancy'>App Engine: Flexible</span> now. For whatever reason, it takes <strong><em>significantly</em></strong> longer to update than any other service.",
            {
              text:
                "We'll be waiting awhile. Don't be alarmed if no new logs show up, we won't see anything for a few minutes until the deployment completes.",
              style: "warning",
            },
          ];
          setTimeout(() => this.tooltip.queue({ messages, style: "danger" }), 20000);
        }
      });
    }

    addBuildEventHandler() {
      console.log("🗞️ Subscribing to build events");
      this.notifier.addSubscription("build", (message) => {
        let status = message.data.status;
        if (status === "started") {
        } else if (status === "finished") {
          this.tooltip.add({
            text: `All seven services have been updated updated. That's a wrap!`,
            style: "primary",
            wait: 2000,
            timeout: 0,
          });
          setTimeout(() => {
            this.activeBuild = null;
            this.tooltip.reset();
          }, 30000);
        }
      });
    }

    async deploy(themeOpt = 0) {
      console.debug(`🏗️ Starting Cloud Build deployment`);
      this.isLoading = true;
      this.tooltip.reset();

      // Add callbacks for the various notifications that'll be sent as part
      // of the build process
      this.addUpdateHandler();
      this.addBuildEventHandler();

      // Trigger build from backend
      let resp = await this.appService.deployUpdate({
        gradient: this.gradients[themeOpt].name,
        asciiFont: this.asciiFonts[themeOpt],
        font: this.fonts[themeOpt],
      });
      let data = await resp.json();

      // Queue some messages to show a commentary when the build is
      // in-progress
      let messages = [
        "The build logs from Cloud Build are streaming live below. You can make the output larger by clicking anywhere below.",
        {
          text:
            "Special shoutout to my wife for her careful consideration for what emojis to use for these tooltips ❤️",
          style: "primary",
          wait: 12000,
        },
      ];

      // A status code of 409 means another build is in progress
      if (resp.status == 409) {
        messages.unshift({
          text:
            "It seems a deployment is already in progress. Let's take a peek at the logs...",
          style: "danger",
        });
      } else if (!resp.ok) {
        this.tooltip.add({ text: data.detail, style: "danger" });
        this.isLoading = false;
        return;
      } else {
        messages.unshift(
          "Nice one! You just triggered a new <strong>Cloud Build</strong> job, it's going to deploy a new version of the app to each service."
        );
      }
      this.tooltip.queue({ messages });
      this.activeBuild = data;
      this.isLoading = false;
    }
  }

  Object.assign(window, {
    AppBuilder,
    Tooltip,
    NotificationService,
    AppService,
    LogHandler,
    utils,
  });
})();

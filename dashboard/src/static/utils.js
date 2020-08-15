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
      this.apps = new Map();
      this.subscriptions = new Array();
      this.latestVersion = null;
      this.lastUpdated = new Date(1990, 1, 1);
      this._activePolls = new Map();
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
      const overlay = el.getElementsByClassName("is-overlay")[0];

      // You can never have too many emojis... I'm using these to provide a bit
      // of colour when I log to the console
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
          overlay.classList.remove("is-hidden");
          overlay.getElementsByClassName("title")[0].innerHTML = resp.error;
        } else if (iframe.dataset.error) {
          // Remove the mask covering the iframe if there was an error in a
          // previous iteration that's no longer relevant
          iframe.removeAttribute("data-error");
          overlay.classList.add("is-hidden");
          overlay.getElementsByClassName("title")[0].innerHTML = app.title;
        }

        // Check whether the version returned by the client matches the latest
        // version sent by the backend
        if (resp.app && resp.app.version === this.latestVersion) {
          this._activePolls.delete(app.name);

          // Update local copy of the app
          app = { ...app, ...resp.app };
          this.apps.set(app.name, app);

          // Update elements that reference the app's properties. No fancy React
          // or Vue here, we have to do it by hand
          el.dataset.version = app.version;
          el.dataset.title = app.title;
          iframe.name = `${iframe.name.split("-")[0]}-${updated}`;
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

  /* Setup ------------------------------------------------------------------ */

  // Initialise everything and make them accessible globally
  const notificationService = new NotificationService();
  const appService = new AppService();
  const logHandler = new LogHandler(document.getElementById("logs"));

  // When a build is active, the backend will send log messages that will be
  // picked up by the `LogHandler` and added to the DOM
  notificationService.addSubscription("log", (message) =>
    logHandler.createLogRecord(message.data)
  );

  // The backend is responsible for polling each app to check if and when
  // they're updated to a new version. When a new version is detected, the
  // backend sends a message to every client so they can refresh and show the
  // new version
  notificationService.addSubscription("refresh-app", (message) =>
    appService.refreshApp(message.data)
  );

  // Move aside Lodash, I'm commandeering this 'ere underscore
  window._ = { notificationService, appService, logHandler, utils };
})();

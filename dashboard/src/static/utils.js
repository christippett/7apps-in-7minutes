(function () {
  /* LOG STREAM CLIENT ------------------------------------------------------ */

  window.LogStreamClient = (function () {
    const scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
    const webSocketUri =
      scheme +
      window.location.hostname +
      (location.port ? ":" + location.port : "") +
      "/ws";

    const createLogElement = (data) => {
      let el = document.createElement("p");
      el.setAttribute("data-id", data.id);
      el.setAttribute("data-step", data.step_name);
      el.setAttribute("data-source", data.source);
      el.setAttribute("data-state", data.state);

      let ts = new Date(data.timestamp);
      let tsHour = ts.getHours().toString().padStart(2, "0");
      let tsMin = ts.getMinutes().toString().padStart(2, "0");
      let logHtml = [
        `<span class="lg-ts">${tsHour}:${tsMin}</span>`,
        `<span class="lg-step">Step ${data.step_id}</span>`,
        `<span class="lg-text">${data.text}</span>`,
      ];

      el.innerHTML = logHtml.join("");
      return el;
    };

    const connect = (logContainerElement) => {
      const websocket = new WebSocket(webSocketUri);
      websocket.onopen = () => console.log("✏️ Log stream connected");
      websocket.onerror = (e) => console.log(`💥 Error with log stream: ${e}`);
      websocket.onclose = () => {
        console.log("🔌 Log stream disconnected");
        // Attempt to re-connect
        setTimeout(() => connect(logContainerElement), 1000);
      };
      websocket.onmessage = (event) => {
        if (logContainerElement === null) return;
        let data = JSON.parse(event.data);
        let logElement = createLogElement(data);
        logContainerElement.appendChild(logElement);
        logContainerElement.scrollTop = logContainerElement.scrollHeight;
      };
    };

    var logContainerElement = null;

    return {
      connect: (el) => {
        logContainerElement = el;
        connect(logContainerElement);
      },
    };
  })();

  /* APPLICATION STATUS ----------------------------------------------------- */

  window.App = (() => {
    const appMap = new Map();
    const versionMap = new Map();

    const checkStatus = async (iframeElement) => {
      const overlayElement = document.getElementById(
        `${iframeElement.dataset.name}-overlay`
      );
      const parentElement = iframeElement.parentElement;
      const appUrl = iframeElement.dataset.url;
      const appName = iframeElement.dataset.name;
      const appTitle = iframeElement.dataset.title;
      const timestamp = new Date();
      const app = appMap.get(appName);

      try {
        // Get current app version (git commit hash)
        var response = await fetch(appUrl, {
          cache: "no-cache",
          headers: { Accept: "application/json" },
        });
        var data = await response.json();
        var newVersion = data.version;
      } catch (e) {
        overlayElement.classList.remove("is-hidden");
        overlayElement.getElementsByClassName("title")[0].innerText = e.message;
        return;
      }

      document.getElementById(appName).classList.remove("is-hidden");

      if (response === undefined || !response.ok || newVersion === undefined) {
        // Although there's no error, something's still not right
        overlayElement.classList.remove("is-hidden");
        overlayElement.getElementsByClassName("title")[0].innerHTML = "Unavailable";
        return;
      }

      if (app === undefined) {
        app = {
          version: newVersion,
          previousVersion: null,
          lastUpdated: timestamp,
        };
        appMap.set(appName, app);
      }

      if (newVersion !== app.version && newVersion !== app.previousVersion) {
        console.log(`💾 New version detected for ${appTitle} (${newVersion})`);

        appMap.set(appName, {
          version: newVersion,
          previousVersion: app.version,
          lastUpdated: timestamp,
        });

        // Record new version for leaderboard
        var versionStats = versionMap.get(newVersion);
        if (versionStats === undefined) {
          versionStats = new Array();
          versionMap.set(newVersion, versionStats);
        }
        versionStats.push({ app: app.name, title: app.title, updated: timestamp });

        // Add query string to avoid any caching issues
        iframeElement.name = `${iframeElement.name.split("-")[0]}-${timestamp}`;
        iframeElement.src = `${appUrl}?ts=${timestamp}`; // forces refresh

        // Draw attention to the app if a new version is detected
        parentElement.classList.add("has-new-version");
        setTimeout(() => parentElement.classList.remove("has-new-version"), 3000);
      }

      // Reveal app if it was previously mased by an error
      overlayElement.classList.add("is-hidden");
    };

    // Start polling loop
    const monitorStatus = async ({ interval }) => {
      if (monitoringEnabled) {
        var iframes = document.getElementsByTagName("iframe");
        for (var i = 0, max = iframes.length; i < max; i++) {
          checkStatus(iframes[i]);
        }
      }
      setTimeout(() => monitorStatus({ interval }), interval);
    };

    const stopMonitor = () => (monitoringEnabled = false);
    const startMonitor = (payload) => {
      monitoringEnabled = true;
      monitorStatus(payload);
    };

    var monitoringEnabled = true;

    return {
      startMonitor,
      stopMonitor,
      apps: appMap,
      versionStats: versionMap,
    };
  })();

  /* DEPLOYMENT CLIENT ------------------------------------------------------ */

  window.DeploymentClient = (function () {
    const triggerDeployment = async ({ gradientName, asciiFont, titleFont }) => {
      let payload = {
        style: {
          gradient_name: gradientName,
          ascii_font: asciiFont,
          title_font: titleFont,
        },
      };
      let resp = await fetch("/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return { status: resp.status, data: resp.json() };
    };

    return {
      triggerDeployment,
    };
  })();
})();

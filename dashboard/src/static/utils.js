(function () {
  /* LOG STREAM CLIENT ------------------------------------------------------ */

  window.LogStreamClient = (function () {
    const scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
    const webSocketUri =
      scheme +
      window.location.hostname +
      (location.port ? ":" + location.port : "") +
      "/ws";
    const logParentElement = document.getElementById("logs");

    const connect = () => {
      const websocket = new WebSocket(webSocketUri);
      websocket.onopen = () => console.log("🔌 Websocket connected");
      websocket.onerror = (e) => console.log(`💥 Websocket error: ${e.message}`);
      websocket.onclose = () => {
        console.log("🔌 Websocket disconnected");
        // Attempt to re-connect
        setTimeout(connect, 10000);
      };
      websocket.onmessage = (event) => {
        let message = JSON.parse(event.data);
        if (message.type === "log") {
          handleLogMessage(message.body);
        } else if (message.type === "build") {
          handleBuildMessage(message.body);
        } else if (message.type === "echo") {
          console.log(message.body);
        }
      };
    };

    const handleBuildMessage = (data) => {
      let status = data.status;
      if (status === "starting") {
        // Reset log output
        logParentElement.innerHTML = "";
        // Start polling apps for update
        App.startMonitor({ interval: 5000 });
      } else if (status === "finished") {
        App.stopMonitor();
      }
    };

    const handleLogMessage = (data) => {
      let el = document.createElement("p");
      el.setAttribute("data-step", data.step || "");
      el.setAttribute("data-id", data.id || "");
      el.setAttribute("data-status", (data.status || "").toLowerCase());

      let message = data.status || data.message || data.text;
      let html = [
        `<span class="lg-step">${(data.step || "").padEnd(2)}</span> `,
        `<span class="lg-id">${data.id || ""}</span>`,
        `<span class="lg-text">${message}</span>`,
      ];
      el.innerHTML = html.join(" ");
      logParentElement.appendChild(el);
      logParentElement.scrollTop = logParentElement.scrollHeight;
    };

    return {
      connect,
    };
  })();

  /* APPLICATION STATUS ----------------------------------------------------- */

  window.App = (() => {
    const appMap = new Map();
    const versionMap = new Map();
    var monitoringEnabled = false;

    // Start polling loop
    const startMonitor = async ({ interval }) => {
      if (monitoringEnabled) {
        console.log("☝️ App monitor already running");
        return;
      } else {
        monitoringEnabled = true;
        var iframes = document.getElementsByTagName("iframe");
      }
      console.log("〽️ App monitor started");
      (function () {
        const checkLoop = () => {
          if (!monitoringEnabled) {
            console.log("🛑 App monitor stopped");
            return;
          }
          for (var i = 0, max = iframes.length; i < max; i++) checkStatus(iframes[i]);
          setTimeout(checkLoop, interval);
        };
        checkLoop();
      })();
    };

    const stopMonitor = () => (monitoringEnabled = false);

    const checkStatus = async (iframeElement) => {
      const timestamp = new Date();
      const appName = iframeElement.dataset.name;
      const appUrl = iframeElement.dataset.url;
      const appTitle = iframeElement.dataset.title;
      const app = appMap.get(appName);
      const overlayElement = document.getElementById(`${appName}-overlay`);
      const appElement = document.getElementById(appName);

      console.debug(`〽️ Checking app status: ${appName}`);

      var errorMessage = null;
      try {
        // Get current app version (git commit hash)
        var response = await fetch(appUrl, {
          cache: "no-cache",
          headers: { Accept: "application/json" },
        });
        var data = await response.json();
        var newVersion = data.version;
      } catch (e) {
        errorMessage = e.message;
      }

      if (response === undefined || !response.ok || newVersion === undefined) {
        iframeElement.setAttribute("data-error", true);
        overlayElement.classList.remove("is-hidden");
        overlayElement.getElementsByClassName("title")[0].innerHTML =
          errorMessage || "Unavailable";
        return;
      } else if (
        iframeElement.hasAttribute("data-error") ||
        appElement.classList.contains("is-hidden")
      ) {
        // Reveal app if it was previously mased by an error
        iframeElement.removeAttribute("data-error");
        iframeElement.src = `${appUrl}?ts=${timestamp}`; // refresh iframe
        overlayElement.classList.add("is-hidden");
        appElement.classList.remove("is-hidden");
      }

      if (app === undefined) {
        appMap.set(appName, {
          version: newVersion,
          previousVersion: null,
          lastUpdated: timestamp,
        });
      } else if (newVersion !== app.version && newVersion !== app.previousVersion) {
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

        // Draw attention to the app when a new version is detected
        appElement.classList.add("has-new-version");
        setTimeout(() => appElement.classList.remove("has-new-version"), 3000);
      }
    };

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

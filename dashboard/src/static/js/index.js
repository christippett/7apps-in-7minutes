import { Timeline } from "/static/js/timeline.js";
import {
  AppBuilder,
  AppService,
  LogHandler,
  NotificationService,
  Tooltip,
} from "/static/js/utils.js";

(() => {
  const tooltips = [];
  window.demo = function () {
    return {
      isFullscreen: false,
      isLoading: false,
      themeOpt: 0,
      tooltips: tooltips,
      tooltip: new Tooltip({ collection: tooltips }),
      builder: new AppBuilder({
        appService: new AppService({ apps: props.apps }),
        notificationService: new NotificationService(),
        logHandler: new LogHandler(document.getElementById("logs")),
        timeline: new Timeline({ parent: "#timeline" }),
      }),
      init() {
        this.tooltip._tooltips = this.tooltips;
        this.builder.init({ externalRef: { ...this, ...props } });
      },
      selectTheme(opt) {
        let themeCount = props.themes.length - 1;
        if (opt > themeCount) {
          this.themeOpt = 0;
        } else if (opt < 0) {
          this.themeOpt = themeCount;
        } else {
          this.themeOpt = opt;
        }
      },
      themeStyle(scope) {
        let theme = props.themes[this.themeOpt];
        let colors = theme.gradient.colors;
        if (scope === "preview") {
          return [
            `background: ${colors[0]};`,
            `background: linear-gradient(45deg,${colors.join(",")}) 0% 0% / 400% 400%;`,
          ].join(" ");
        } else if (scope === "title") {
          return `font-family: '${theme.font}';`;
        }
      },
    };
  };

  import("https://cdn.jsdelivr.net/gh/alpinejs/alpine@v2.x.x/dist/alpine.min.js");
})();

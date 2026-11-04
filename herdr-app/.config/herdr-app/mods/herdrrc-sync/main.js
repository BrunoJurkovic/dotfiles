// Source: ~/.dotfiles/herdr-app/.config/herdr-app/mods/herdrrc-sync (copied in by herdr-reload; edit there).
// Saving anything in the herdr-app dotfiles package applies it, as saving
// herdrrc does: watches the package (herdrrc, layouts.d, mods, themes, program
// icons) and runs herdr-reload, which renders herdrrc and the layouts and
// copies the rest in as real files; once when Herdr starts, too. Draws nothing:
// it floats, unseen, in the bruno layout. While Herdr is closed, the
// local.herdr-reload LaunchAgent still covers herdrrc and the layouts, and runs
// at login.

import { View, div } from "gpui-kit";
import { appHome, exec, home, watchFolder } from "herdr";

// What editors and Herdr leave behind that isn't a change to the package.
const NOISE = /(\/gpui-kit\.d\.ts|\/jsconfig\.json|\.DS_Store|~|\.swp|\.swx|4913)$/;

export default class HerdrrcSync extends View {
  init(_props, cx) {
    const pkg = `${home()}/.dotfiles/herdr-app/.config/herdr-app`;
    // This window's own home: a dev instance reloads itself, and the live app
    // stays put while the package holds (.hold). herdr-reload reports its own
    // errors (Notification Center).
    const reload = () => exec("env", [`HERDR_APP_HOME=${appHome()}`, `${home()}/.local/bin/herdr-reload`]).catch(() => null);
    cx.spawn(async () => {
      // At start only when Herdr has put its own `toast` back (it moves the
      // package's to toast-edited on every start). Never unconditionally: a
      // reload restarts this mod too, so that loops.
      const moved = await exec("test", ["-d", `${appHome()}/mods/toast-edited`]).catch(() => null);
      if (moved?.code === 0) await reload();
      for (;;) {
        const changed = await watchFolder(pkg);
        if (changed.every((p) => NOISE.test(p))) continue;
        await reload();
      }
    });
  }

  render() {
    return div();
  }
}

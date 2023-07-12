import { observableBoxWithInitializers } from "./lib/mobx-recoil/observable_box_with_init";
import serverAPI from "./ClientToServerAPI";

export const upgradePrompt = observableBoxWithInitializers<string>({
  default: "",
  effects: [
    ({ setSelf }) => {
      const disposable = serverAPI.onMessageOfType(
        "fetchedUpgradePrompt",
        (event) => {
          setSelf(event.message);
        }
      );
      return () => disposable.dispose();
    },
    () =>
      serverAPI.onSetup(() =>
        serverAPI.postMessage({
          type: "fetchUpgradePrompt",
        })
      ),
  ],
});

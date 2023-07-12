import type { ConfigName } from "@withgraphite/gti-shared";
import type { Json } from "@withgraphite/gti-shared";

import serverAPI from "./ClientToServerAPI";
import { observableBoxWithInitializers } from "./lib/mobx-recoil/observable_box_with_init";

export const observableConfig = <T extends Json>({
  config,
  default: defaultValue,
  defaultAfterNetworkReturn: defaultAfterNetworkReturn,
}: {
  config: ConfigName;
  default: T;
  defaultAfterNetworkReturn?: T;
}) => {
  let networkHasReturned = false;

  return observableBoxWithInitializers<T>({
    default: defaultValue,
    setter: (value) => {
      serverAPI.postMessage({
        type: "setConfig",
        name: config,
        value: JSON.stringify(value),
      });
    },
    effects: [
      ({ setSelf }) => {
        const disposable = serverAPI.onMessageOfType("gotConfig", (event) => {
          if (event.name === config) {
            if (event.value != null) {
              setSelf(JSON.parse(event.value));
            } else if (
              networkHasReturned === false &&
              typeof defaultAfterNetworkReturn !== "undefined"
            ) {
              setSelf(defaultAfterNetworkReturn);
            }

            networkHasReturned = true;
          }
        });
        return () => disposable.dispose();
      },
      () => {
        const disposable = serverAPI.onConnectOrReconnect(() => {
          serverAPI.postMessage({
            type: "getConfig",
            name: config,
          });
        });
        return () => disposable();
      },
    ],
  });
};

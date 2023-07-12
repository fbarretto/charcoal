import type { ReactNode } from "react";

import platform from "./platform";

import "./themeLight.scss";
import "./themeDark.scss";
import { observableBoxWithInitializers } from "./lib/mobx-recoil/observable_box_with_init";
import { observer } from "mobx-react-lite";
import type { ThemeColor } from "@withgraphite/gti-shared";

const THEME_LOCAL_STORAGE_KEY = "gti-color-theme";

export const themeState = observableBoxWithInitializers<ThemeColor>({
  default:
    platform.theme?.getTheme() ??
    (localStorage.getItem(THEME_LOCAL_STORAGE_KEY) as ThemeColor) ??
    "dark",
  setter: (newValue) => {
    localStorage.setItem(THEME_LOCAL_STORAGE_KEY, newValue);
  },
  effects: [
    ({ setSelf }) => {
      const disposable = platform.theme?.onDidChangeTheme((theme) => {
        setSelf(theme);
      });
      return () => disposable?.dispose();
    },
  ],
});

export const ThemeRoot = observer(({ children }: { children: ReactNode }) => {
  const theme = themeState.get();
  return <div className={`gti-root ${theme}-theme`}>{children}</div>;
});

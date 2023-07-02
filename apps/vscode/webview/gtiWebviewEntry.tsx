import App from "@withgraphite/gti/src/App";
import ReactDOM from "react-dom/client";

import "./vscode-styles.scss";

window.addEventListener("load", () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  root.render(<App />);
});

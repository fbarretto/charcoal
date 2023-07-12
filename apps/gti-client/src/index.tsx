import App from "./App";
import "react";
import ReactDOM from "react-dom/client";

// @vscode/webview-ui-toolkit doesn't ship with light theme variables,
// we need to include them ourselves in non-vscode renders of <App />.
import "./themeLightVariables.scss";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);

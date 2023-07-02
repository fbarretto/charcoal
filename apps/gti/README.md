# Graphite interactive

Graphite interactive (`gti`) is an embeddable, web-based GUI for Graphite.

The code for `gti` lives in the addons folder:

| folder          | use                                                                     |
| --------------- | ----------------------------------------------------------------------- |
| gti             | Front end UI written with React and MobX                                |
| gti-sever       | Back end, which runs gt commands / interacts with the repo              |
| gti-sever/proxy | `gt interactive web` CLI and server management                          |
| shared          | Utils shared by gti and gti-server                                      |
| vscode          | Coming soon: VS Code extension for Graphite, including gti as a webview |

## Development

As always, first run `yarn` to make sure all of the Node dependencies are installed.
Then launch the following three components in order:

 - `cd gti-server && yarn watch`
 - `cd gti-server && yarn serve --foreground --stdout --dev --cwd ~/monologue`
 - `cd gti && yarn start`

### Client

**In the gti folder, run `yarn start`**.
This will make a development build with [Create React App](https://create-react-app.dev/).
This watches for changes to the front end and incrementally re-compiles.
Unlike most CRA apps, this will not yet open the browser,
because we need to open it using a token from when we start the server.

### Server

**In the `gti-server/` folder, run `yarn watch` and leave it running.**
This watches for changes to the server side back end and incrementally re-compiles.
This ensures the server code is bundled into a js file that runs a proxy
(in `gti-server/dist/run-proxy.js`) to handle requests.

### Proxy

We launch a WebSocket Server to proxy requests between the server and the
client. The entry point code lives in the `gti-server/proxy/` folder and is a
simple HTTP server that processes `upgrade` requests and forwards
them to the WebSocket Server that expects connections at `/ws`.

**In the `gti-server/` folder, run `yarn serve --dev` to start the proxy and open the browser**.
You will have to manually restart it in order to pick up server changes.
This is the development mode equivalent of running `gt interactive web`.

Note: When the server is started, it creates a token to prevent unwanted access.
`--dev` opens the browser on the port used by CRA in `yarn start`
to ensure the client connects with the right token.

See `../vscode/CONTRIBUTING.md` for build instructions for the vscode extension.

When developing, it's useful to add a few extra arguments to `yarn serve`:

`yarn serve --dev --force --foreground --stdout --command gt`

- `--dev`: Connect to the CRA dev build's hot-reloading front-end server (defaulting to 3000), even though this server will spawn on 3001.
- `--force`: Kill any other active GTI server running on this port, which makes sure it's the latest version of the code.
- `--foreground`: instead of spawning the server in the background, run it in the foreground. `ctrl-c`-ing the `yarn serve` process will kill this server.
- `--stdout`: when combined with `--foreground`, prints the server logs to stdout so you can read them directly in the `yarn serve` terminal output.
- `--command gt`: override the command to use for `gt`, for example you might use `./gt`, or an alias to your local build like `gt`

## Production builds

`gti/release.js` is a script to build production bundles and
package them into a single self-contained directory that can be distributed.

`yarn build` lets you build production bundles without watching for changes, in either
`gti/` or `gti-server/`.

# Internals

The following sections describe how GTI is implemented.

## Architecture

GTI uses an embeddable Client / Server architecture.

- The Client runs in a browser-like context (web browser, VS Code webview, Electron renderer)
- The Server runs in a node-like context (node server from `gt`, VS Code extension host, Electron main)

The server serves the client's static (html/js/css) files via HTTP.
The client JavaScript then connects back to the server via WebSocket,
where both sides can send and receive messages to communicate.

### Client

The client renders the UI and asks the server to actually do stuff. The client has no direct access
to the filesystem or repository. The client can make normal web requests, but does not have access tokens
to make authenticated requests to GitHub.

The client uses React (for rendering the UI) and MobX (for state management).

### Server

The server is able to interact with the file system, spawn processes, run `gt` commands,
and make authenticated network requests to Graphite.
The server is also responsible for watching the repository for changes.
This will optionally use Watchman if it's installed.
If not, the server falls back to a polling mechanism, which polls on a variable frequency
which depends on if the UI is focused and visible.

Most of the server's work is done by the `Repository` object, which represents a single Sapling repository.
This object also delegates to manage Watchman subscriptions and GitHub fetching.

### Server reuse and sharing

To support running `gt web` in multiple repos / cwds at the same time, `gti` supports reusing server instances.
When spawning an GTI server, if the port is already in use by an GTI server, that server will be reused.

Since the server acts like a normal http web server, it supports multiple clients connecting at the same time,
both the static resources and WebSocket connections.

`Repository` instances inside the server are cached per repo root.
`RepositoryCache` manages Repositories by reference counting.
A `Repository` does not have its own cwd set. Rather, each reference to a `Repository`
via `RepositoryCache` has an associated cwd. This way, A single `Repository` instance is reused
even if accessed from multiple cwds within the same repo.
We treat each WebSocket connection as its own cwd, and each WebSocket connections has one reference
to a shared Repository via RepositoryCache.

Connecting multiple clients to the same sever at the same cwd is also supported.
Server-side fetched data is sent to all relevant (same repo) clients, not just the one that made a request.
Note that client-side cached data is not shared, which means optimistic state may not work as well
in a second window for operations triggered in a different window.

After all clients are disconnected, the server auto-shutdowns after one minute with no remaining repositories
which helps ensure that old GTI servers aren't reused.

Note that GTI exposes `--kill` and `--force` options to kill old servers and force a fresh server, to make
it easy to work around unexpectedly reusing old GTI servers.

### Security

The client sends messages to the server to run `gt` commands.
We must authenticate clients to ensure arbitrary websites or XSS attacks can't connect on localhost:3011 to run commands.
The approach we take is to generate a cryptographic token when a server is started.
Connecting via WebsOcket to the server requires this token.
The token is included in the url generated by `gt interactive web`, which allows URLs from `gt interactive web` to connect successfully.

Because of this token, restarting the GTI server requires clicking a fresh link to use the new token.
Once an GTI server stops running, its token is no longer valid.

In order to support reusing GTI servers, we must persist the server's token to disk,
so that later `gt interactive web` invocations can find the right token to use.
This persisted data includes the token but also some other metadata about the server,
which is written to a permission-restricted file.

Detail: we have a second token we use to verify that a server running on a port
is actually an GTI server, to prevent misleading/phising "reuses" of a server.

## Embedding

GTI is designed to be embedded in multiple contexts. `gt interactive web` is the default,
which is also the most complicated due to server reuse and managing tokens.

The Graphite VS Code extension's GTI webview is another example of an embedding.
Other embeddings are possible, such as an Electron / Tauri standalone app, or
other IDE extensions such as Android Studio.

### Platform

To support running in multiple contexts, GTI has the notion of a Platform,
on both the client and server, which contains embedding-specific implementations
of a common API.

This includes things like opening a file. In the browser, the best we can do is use the OS default.
Inside the VS Code extension, we always want to open with VS Code.
Each platform can implement this to match their UX best.
The Client's platform is where platform-specific code first runs. Some embeddings
have their client platform send platform-specific messages to the server platform.

The "default" platform is the BrowserPlatform, used by `gt interactive web`.

Custom platforms can be implemented either by:

- including platform code in the build process (the VS Code extension does this)
- adding a new platform to gti-server for use by `run-proxy`'s `--platform` option (android studio does this)

## Syncing repository state

GTI started as a way to automatically re-run `gt interactive status` and `gt interactive log` in a loop.
The UI should always feel up-to-date, even though it needs to run these commands
to actually fetch the data.
The client subscribes to this data, which the server is in charge of fetching automatically.
The server uses Watchman (if installed) to detect when:

- the `.git` has changed to indicate the list of commits has changed, so we should re-run `gt interactive log`.
- any normal file in the repository has changed, so we should re-run `gt interactive status` to look for uncommitted changes.
  If Watchman is not installed, `gt interactive log` and `gt interactive status` are polled on an interval by `WatchForChanges`.

Similarly, the server fetches new data from GitHub when the list of PRs changes, and refreshes by polling.

## Running Operations

GTI defines an "Operation" as any mutating `gt` command, such as `gt pull`, `gt upstack onto`, `gt branch checkout`, `gt branch amend`, etc. Non-examples include `gt log`, `gt status`.

The lifecycle of an operation looks like this:

```
Ready to run -> Preview -> Queued -> Running -> Optimistic state -> Completed
```

### Preview Appliers

Critically, fetching data via `gt log` and `gt status` is separate from running operations.
We only get the "new" state of the world after _both_ the operation has completed _AND_
`gt log` / `gt status` has run to provide us with the latest data.

This would cause the UI to appear laggy and out of date.
Thus, we support using previews and optimistic to update the UI immediately.

To support this, GTI defines a "`preview applier`" function for every operation.
The preview applier function describes how the tree of commits and uncommitted changes
would change as a result of running this operation.
(Detail: there's actually a separate preview applier function for uncommitted changes and the commit tree
to ensure UI smoothness if `gt interactive log` and `gt interactive status` return data at different times)

This supports both:

- **previews**: What would the tree look like if I ran this command?
  - e.g. Drag & drop rebase preview before clicking "run rebase"
- **optimistic state**: How should we pretend the tree looks while this command is running?
  - e.g. showing result of a rebase while rebase command is running

Because `gt interactive log` and `gt interactive status` are run separately from an operation running,
the optimistic state preview applier must be used not just while the operation is running,
but also _after_ it finishes up until we get new data from `gt interactive log` / `gt interactive status`.

### Queued commands

Preview Appliers are functions which take a commit tree and return a new commit tree.
This allows us to stack the result of preview appliers on top of each other.
This trivially enables _Queued Commands_, which work like `&&` on the CLI.

If an operation is ongoing, and we click a button to run another,
it is queued up by the server to run next.
The client then renders the tree resulting from first running Operation 1's preview applier,
then running Operation 2's preview applier.

Important detail here: if an operation references a commit hash, the queued version
of that operation will not yet know the new hash after the previous operation finishes.
For example, `gt branch amend` in the middle of a stack, then `gt branch checkout` the top of the stack.
Thus, when telling the server to run an Operation we tag which args are revsets,
so they are replaced with `max(sucessors(${revset}))` so the hash is replaced
with the latest successor hash.

# Debugging

## ✅ Attaching GTI server to VS Code debugger

There's a "Run & Debug gti-server" vscode build action which runs `yarn serve --dev` for you with a few additional arguments. When spawned from here, you can use breakpoints in VS Code to step through your server-side code.

Note that you should have the client & server webpack compilation jobs (described above) running before doing this (it currently won't compile for you, just launch `yarn serve`).

## ❓ Attaching GTI client to a debugger

Attaching the client to VS Code debugger does not work as well as the server side.
There is currently no launch task to launch the browser and connect to the debugger.
You can try using "Debug: Open Link" from the command palette, and paste in the GTI server link
(with the token included), but I found breakpoint line numbers don't match up correctly.

You can open the chrome devtools, go to sources, search for files, and set breakpoints in there,
which will mostly work. `debugger;` statements also work in the dev tools.

## Stack traces

If you encounter a stack trace in production, it will be referencing minified line numbers like:

```txt
Error: something went wrong
    at t (/some/production/path/to/gti-server/dist/run-proxy.js:1:4152)
```

We build/ship with source maps that sit next to source files, like `gti-server/dist/run-proxy.js.map`.

You can use these source maps to recover the real stack trace, using a tool like [stacktracify](https://github.com/mifi/stacktracify).

```sh
$ npm install -g stacktracify
# copy minified stack trace to clipboard, then give the path to the source map:
$ stacktracify /path/to/gti-server/dist/run-proxy.js.map
Error: something went wrong
    at from (webpack://gti-server/proxy/proxyUtils.ts:14:22)
```

Note that the source map you use must match the version in the original stack trace.
Usually, you can tell the version by the path in the stack trace.

## Profiling webpack bundle sizes and dependencies

You can visualize what modules are being bundled by webpack for different entry points:

- `cd gti-server`
- `yarn --silent webpack --profile --json > webpack_stats.json`
- Upload that file to <https://chrisbateman.github.io/webpack-visualizer/> to see an easy to understand breakdown of your bundle size
- Upload that file to <https://webpack.github.io/analyse/#modules> to see the exact dependency graph. This is useful for debugging why code is being included by a certain entry point, for example gti-server somehow including something from gti.
- This also works for vscode, but you need to pass the config or use e.g. `yarn build-extension --profile --json`.

Due to Create React App, this is slightly different on the gti client / reviewstack:

- `cd gti`
- [`npx source-map-explorer build/static/js/*.js`](https://create-react-app.dev/docs/analyzing-the-bundle-size/), which opens a browser visualization of your dependencies.

## License
This code is based on the MIT-licensed code `isl` published by Meta as part of the `sapling` project. The original license can be found in `licenses/isl.txt`. It was hard-forked from `https://github.com/facebook/sapling` on sha `708cbba23299934cb0db01fc3112c8a991feaa40`, with selected changes pulled in until sha `89fb18345eb629d11cfe9325ee7708a4b15b6f0f` and later `f7e8639689026587d4ca0ef6939ccbca22d676f8`.

That code can be found here: https://github.com/facebook/sapling/tree/708cbba23299934cb0db01fc3112c8a991feaa40/addons/isl

This derivative work is still governed by the license in the root of this repository.

# Graphite VS Code extension

This folder contains the VS Code extension for GTI (Graphtie interactive).

Note: this file acts the techincal README for the vscode/ folder,
while README.md is the user-facing description of the extension visible in the extension marketplace.

The vscode extension consists of two forms of javascript:

- extension code, running in the vscode extension host process.
  This code uses the vscode API and acts like a node process.
- GTI webview code, running in a vscode webview.
  This code cannot use the vscode API, and acts like its running in a browser.

The two are built separately, and communicate via message passing.
Unlike web `gt` in gti-server/proxy, this does not use websockets
but rather VS Code's own message passing system (which still works across remoting).

## Building & Running

Build artifacts live in `./dist`.

**Development**:

`yarn watch-extension` to compile extension code
`yarn watch-webview` to compile webview code

**Production**:

`yarn build-extension` to build production extension code
`yarn build-webview` to build production extension code

**Dogfooding**

You can use a development build of the vscode extension by symlinking into this folder,
since package.json points to `dist/`:

```
ln -s ./vscode ~/.vscode/extensions/graphite.gti-100.0.0-dev
```

## License
This code is based on the MIT-licensed code `isl` published by Meta as part of the `sapling` project. The original license can be found in `licenses/isl.txt`. It was hard-forked from `https://github.com/facebook/sapling` on sha `708cbba23299934cb0db01fc3112c8a991feaa40`, with selected changes pulled in until sha `89fb18345eb629d11cfe9325ee7708a4b15b6f0f` and later `f7e8639689026587d4ca0ef6939ccbca22d676f8`.

That code can be found here: https://github.com/facebook/sapling/tree/708cbba23299934cb0db01fc3112c8a991feaa40/addons/isl-server

This derivative work is still governed by the license in the root of this repository.

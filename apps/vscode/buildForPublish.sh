#!/bin/bash

export NODE_ENV=production
echo "Cleaning dist"
rm -rf ./dist
echo "Building Extension"
webpack --config extension.webpack.config.ts
echo "Building Webview"
webpack --config webview.webpack.config.ts
echo "Build complete"

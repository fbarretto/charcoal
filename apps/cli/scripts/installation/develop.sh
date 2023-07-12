#!/bin/bash

# A single command to uninstall, rebuild, and reinstall for development
cd "$(dirname "$0")" || exit
./uninstall.sh
rm -rf ../../dist
yarn build
jq '.version = "local"' ../../dist/package.json > ../../dist/tmp_file.json && mv ../../dist/tmp_file.json ../../dist/package.json
./install_dev.sh

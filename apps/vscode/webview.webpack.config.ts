import type webpack from "webpack";

import CircularDependencyPlugin from "circular-dependency-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import path from "path";

module.exports = {
  target: "web",
  // concat preload + actual entry. Preload sets up platform globals before the rest of the app runs.
  entry: {
    gti: ["./webview/gtiWebviewPreload.ts", "./webview/gtiWebviewEntry.tsx"],
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist", "webview"),
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  mode: process.env.NODE_ENV ?? "development",
  devtool: "source-map",
  plugins: [
    new MiniCssExtractPlugin(),
    new CircularDependencyPlugin({
      failOnError: false,
      exclude: /.*node_modules.*/,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                module: "es2020",
              },
              transpileOnly: true,
              configFile: "tsconfig.json",
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          // Creates `style` nodes from JS strings
          "style-loader",
          // Translates CSS into CommonJS
          "css-loader",
          // Compiles Sass to CSS
          "sass-loader",
        ],
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(jpe?g|png|gif|svg)$/i,
        loader: 'file-loader',
        options: {
          name: '/resources/[name].[ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  externals: { ws: "" },
} as webpack.Configuration;

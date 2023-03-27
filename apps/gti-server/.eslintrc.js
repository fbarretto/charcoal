module.exports = {
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  "plugins": ["@typescript-eslint", "import"],
  "rules": {
    "no-console": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_" }
    ],
    "@typescript-eslint/no-floating-promises": "error",
    "import/unambiguous": "error",
    "import/first": "error",
    "no-restricted-syntax": [
      "error",
      {
        "message": "Banned `exit` function. Please exit execution through return statements so as to not skip telemetry.",
        "selector": "MemberExpression > Identifier[name=\"exit\"]"
      }
    ]
  },
  "settings": {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts"]
    },
    "import/resolver": {
      "node": {
        "extensions": [".js", ".ts"]
      },
      "typescript": {
        "alwaysTryTypes": true // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
      }
    }
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/typescript",
    "plugin:prettier/recommended"
  ]
}

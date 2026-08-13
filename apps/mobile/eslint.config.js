// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.native.ts', '.web.ts', '.ts', '.tsx', '.js'],
        },
      },
    },
  }
]);

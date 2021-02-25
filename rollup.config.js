import typescript from "@rollup/plugin-typescript";
import { userscriptHeader } from "./rollup/userscript-header";
import { outputToClipboard } from "./rollup/output-to-clipboard";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/webreader.user.js",
    format: "iife",
  },
  plugins: [
    typescript(),
    nodeResolve(),
    outputToClipboard(),
    userscriptHeader({
      headerFile: "./src/header.ts",
    }),
  ],
};

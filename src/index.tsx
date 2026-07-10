#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import App from "./app.js";

const stdin = process.stdin as NodeJS.ReadStream & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
};

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error(
    "jp-learn 需要在支持方向键输入的交互式终端中运行。请在 PowerShell、CMD 或 Windows Terminal 里执行 npm start。"
  );
  process.exit(1);
}

render(<App />, { exitOnCtrlC: false });

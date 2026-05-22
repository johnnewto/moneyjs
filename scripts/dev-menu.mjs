#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import readline from "node:readline/promises";

const commands = [
  {
    label: "Web dev server",
    command: "pnpm",
    args: ["dev"]
  },
  {
    label: "Chat API dev server",
    command: "pnpm",
    args: ["--filter", "@sfcr/chat-api", "dev"]
  },
  {
    label: "Full test suite",
    command: "pnpm",
    args: ["test"]
  },
  {
    label: "Fast web tests",
    command: "pnpm",
    args: ["web:test:fast"]
  },
  {
    label: "Web integration tests",
    command: "pnpm",
    args: ["web:test:integration"]
  },
  {
    label: "Template tests",
    command: "pnpm",
    args: ["--filter", "@sfcr/web", "run", "test:templates"]
  },
  {
    label: "Typecheck",
    command: "pnpm",
    args: ["typecheck"]
  },
  {
    label: "Build",
    command: "pnpm",
    args: ["build"]
  }
];

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function formatCommand({ command, args }) {
  return [command, ...args].join(" ");
}

function printMenu() {
  console.log("\nSFCR command menu\n");
  commands.forEach((entry, index) => {
    const number = String(index + 1).padStart(2, " ");
    console.log(`${number}. ${entry.label.padEnd(24)} ${formatCommand(entry)}`);
  });
  console.log("\nq. Quit\n");
}

async function main() {
  printMenu();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = (await rl.question("Choose a command: ")).trim().toLowerCase();
  rl.close();

  if (answer === "q" || answer === "quit" || answer === "exit") {
    return;
  }

  const selection = Number(answer);
  const entry = Number.isInteger(selection) ? commands[selection - 1] : undefined;

  if (!entry) {
    console.error(`Invalid selection: ${answer || "(blank)"}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nRunning: ${formatCommand(entry)}\n`);

  const child = spawn(entry.command === "pnpm" ? pnpmCommand : entry.command, entry.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Command stopped by signal ${signal}`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });

  child.on("error", (error) => {
    console.error(`Failed to start command: ${error.message}`);
    process.exitCode = 1;
  });
}

await main();

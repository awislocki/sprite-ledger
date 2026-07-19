// One command, zero config: starts the mock Epic server + Next dev wired to it.
// Sessions use a random per-run secret (sign in fresh each run).
import { spawn } from "child_process";
import crypto from "crypto";

const env = {
  ...process.env,
  SESSION_SECRET: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  EPIC_AUTH_HOST: "http://127.0.0.1:9999",
  EPIC_FN_HOST: "http://127.0.0.1:9999",
  NEXT_PUBLIC_MOCK: "1",
};

const mock = spawn("node", ["scripts/mock-epic.mjs"], { stdio: "inherit", env });
const next = spawn("npx", ["next", "dev"], { stdio: "inherit", env });

const stop = () => { mock.kill(); next.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", stop);

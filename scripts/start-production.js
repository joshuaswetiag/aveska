const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function bin(name) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(process.cwd(), "node_modules", ".bin", `${name}${ext}`);
}

function run(name, command, args) {
  if (!fs.existsSync(command)) {
    console.error(`${name} binary missing: ${command}`);
    if (name === "web") process.exit(1);
    setTimeout(() => run(name, command, args), 3000);
    return;
  }
  console.log(`starting ${name}`);
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  child.on("error", (error) => {
    console.error(`${name} failed to spawn`, error);
  });
  child.on("exit", (code, signal) => {
    console.error(`${name} exited`, { code, signal });
    if (name === "web") process.exit(code || 1);
    setTimeout(() => run(name, command, args), 2000);
  });
}

run("worker", bin("tsx"), ["src/lib/jobs/worker.ts"]);
run("web", bin("next"), ["start", "--hostname", "0.0.0.0"]);

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
let restarts = 0;

function run() {
  const child = spawn(process.execPath, ["--import", "tsx", path.join(dir, "src/index.ts")], { stdio: "inherit", cwd: dir });
  child.on("exit", (code, signal) => {
    if (signal === "SIGINT" || signal === "SIGTERM" || code === 0) {
      process.exit(code ?? 0);
    }
    restarts += 1;
    const delay = Math.min(3000 * restarts, 30000);
    console.error(`[supervisor ${new Date().toISOString()}] ingest exited (code=${code}, signal=${signal}); restart #${restarts} in ${delay / 1000}s`);
    setTimeout(run, delay);
  });
  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
}

run();

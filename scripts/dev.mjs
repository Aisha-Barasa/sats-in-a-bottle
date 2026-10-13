// Runs the Vite frontend and the Express API together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const procs = [
  ["web", [npm, ["--prefix", "web", "run", "dev"]], "\x1b[35m"],
  ["api", [npm, ["--prefix", "server", "run", "dev"]], "\x1b[36m"],
].map(([name, [cmd, args], color]) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    process.stdout.write(`${tag}exited with code ${code}\n`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

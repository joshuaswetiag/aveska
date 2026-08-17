import { spawn } from "child_process";
import { saveTrackingUrl } from "../src/lib/email/tracking-record";

const LOCAL = process.env.TRACKING_LOCAL_URL?.trim() || "http://localhost:3000";
const PUBLIC_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

async function main() {
  console.log(`Starting a worldwide HTTPS tunnel to ${LOCAL}`);
  console.log("Keep this window open. Customers anywhere can then hit tracking links.");
  const child = spawn("npx", ["--yes", "cloudflared", "tunnel", "--url", LOCAL], {
    shell: true,
    windowsHide: true,
  });

  let saved = "";
  const onChunk = async (chunk: Buffer) => {
    const text = chunk.toString();
    process.stderr.write(text);
    const match = text.match(PUBLIC_URL);
    if (!match || match[0] === saved) return;
    saved = match[0];
    await saveTrackingUrl(saved);
    console.log("");
    console.log(`Worldwide tracking URL saved: ${saved}`);
    console.log("Now send (or resend) campaign emails. Clicks from any country will show under Traffic.");
    console.log("If you stop this tunnel, tracking links in those emails will stop working until you start it again.");
    console.log("");
  };

  child.stdout?.on("data", (chunk) => void onChunk(chunk));
  child.stderr?.on("data", (chunk) => void onChunk(chunk));
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

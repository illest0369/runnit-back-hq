import { execFile } from "child_process";
import { promisify } from "util";
import type { NextApiRequest, NextApiResponse } from "next";

const execFileAsync = promisify(execFile);

// Strict input validation — prevents command injection
const TIMESTAMP_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const SAFE_ID_RE   = /^[a-zA-Z0-9_-]{1,64}$/;
const URL_RE       = /^https?:\/\/.+/;

const PROJECT_PATH = process.env.PIPELINE_PATH ?? "/Users/malyhernandez/runnit-back-hq";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, start, end, post_id, platform, operator } = req.body ?? {};

  if (!url || !start || !end || !post_id || !platform || !operator) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!URL_RE.test(url)) {
    return res.status(400).json({ error: "Invalid url" });
  }
  if (!TIMESTAMP_RE.test(start) || !TIMESTAMP_RE.test(end)) {
    return res.status(400).json({ error: "Invalid timestamp — use M:SS or H:MM:SS" });
  }
  if (!SAFE_ID_RE.test(post_id) || !SAFE_ID_RE.test(platform) || !SAFE_ID_RE.test(operator)) {
    return res.status(400).json({ error: "post_id, platform, and operator must be alphanumeric" });
  }

  // Per-request filename prevents race conditions between concurrent requests
  const inputFile = `input_${Date.now()}.webm`;
  const inputPath = `${PROJECT_PATH}/${inputFile}`;

  try {
    // Step 1: download video — args array, never a shell string
    await execFileAsync("yt-dlp", ["-o", inputPath, url], {
      timeout: 120_000,
    });

    // Step 2: run pipeline — args array, env vars explicitly forwarded
    const { stdout, stderr } = await execFileAsync(
      `${PROJECT_PATH}/scripts/run_pipeline.sh`,
      [inputFile, start, end, post_id, platform, operator],
      {
        cwd: PROJECT_PATH,
        timeout: 120_000,
        env: {
          ...process.env,
          R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID        ?? "",
          R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID     ?? "",
          R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
          R2_BUCKET:            process.env.R2_BUCKET            ?? "",
        },
      }
    );

    const match = stdout.match(/R2_URL=(.*)/);
    if (!match) {
      return res.status(500).json({ error: "Upload failed", details: stderr });
    }

    return res.status(200).json({ success: true, cdn_url: match[1].trim() });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Processing failed", details: message });

  } finally {
    // Always clean up the downloaded input file, success or failure
    await execFileAsync("rm", ["-f", inputPath]).catch(() => {});
  }
}

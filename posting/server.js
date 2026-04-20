#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const SESSION_ROOT = path.join(__dirname, "..", "sessions");
const CHANNELS = {
  sports: {
    endpoint: "/post-sports",
    account: "@runnitbacksports",
    operator: "manny",
  },
  arena: {
    endpoint: "/post-arena",
    account: "@runnitbackarena",
    operator: "matt",
  },
  women: {
    endpoint: "/post-women",
    account: "@runnitbackwomen",
    operator: "maly",
  },
  combat: {
    endpoint: "/post-combat",
    account: "@runnitbackcombat",
    operator: "agent",
  },
};

function resolveChannel(urlPath) {
  if (urlPath === "/post") {
    return null;
  }

  return Object.entries(CHANNELS).find(([, config]) => config.endpoint === urlPath)?.[0] ?? null;
}

function getChannelConfig(channel) {
  return CHANNELS[channel] ?? null;
}

async function openChannelContext(channel) {
  const sessionDir = path.join(SESSION_ROOT, channel);
  fs.mkdirSync(sessionDir, { recursive: true });

  try {
    const { chromium } = require("playwright");
    const context = await chromium.launchPersistentContext(sessionDir, {
      headless: false,
    });
    return { context, sessionDir };
  } catch (error) {
    return { context: null, sessionDir };
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const expectedChannel = resolveChannel(req.url);

  if (req.url !== "/post" && !expectedChannel) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    let job = {};

    try {
      job = body ? JSON.parse(body) : {};
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const videoUrl = job.video_url || "";
    const caption = job.caption || "";
    const channel = job.channel || "";
    const status = job.status || "";
    const postId = job.post_id || "";
    const account = job.account || "";
    const operator = job.operator || "";
    const channelConfig = getChannelConfig(channel);

    console.log("POST_JOB_RECEIVED", {
      post_id: postId,
      video_url: videoUrl,
      caption,
      channel,
      status,
    });
    console.log("STATUS:", status);

    if (!channelConfig) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown channel" }));
      return;
    }

    if (expectedChannel && channel !== expectedChannel) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Channel mismatch" }));
      return;
    }

    if (account && account !== channelConfig.account) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Channel mismatch" }));
      return;
    }

    if (operator && operator !== channelConfig.operator) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Channel mismatch" }));
      return;
    }

    if (job.status !== "approved") {
      console.log("SKIPPED:", postId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "skipped" }));
      return;
    }

    if (!videoUrl || !channel) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "video_url and channel are required" }));
      return;
    }

    let contextHandle;

    try {
      contextHandle = await openChannelContext(channel);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session initialization failed" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      post_id: postId,
      video_url: videoUrl,
      caption,
      channel,
      account: channelConfig.account,
      operator: channelConfig.operator,
      session_dir: contextHandle?.sessionDir,
      status: "posted",
    }));

    if (contextHandle?.context) {
      await contextHandle.context.close().catch(() => {});
    }
  });
});

server.listen(PORT, () => {
  console.log(`Posting worker listening on port ${PORT}`);
});

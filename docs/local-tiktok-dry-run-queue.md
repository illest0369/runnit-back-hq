# Local TikTok Dry-Run Queue

Local operator dry-runs must not enqueue into the shared production TikTok post queue.

The default post queue is `rbhq-post`. Railway or another external worker may be connected to the same Redis instance and queue. If a local test uses shared Redis plus `rbhq-post`, that external worker can reserve the job before the local dry-run worker sees it, then fail or complete the job outside the local validation loop.

Use this isolated queue for local dry-runs:

```sh
RBHQ_POST_QUEUE_NAME=rbhq-post-local-dry-run
```

Start the enqueue side and worker with the same queue name:

```sh
npm run build:worker
npm run dev:local-dry-run
npm run worker:post:dry-run:local
```

`npm run dev:local-dry-run` makes the Next app enqueue TikTok send jobs to `rbhq-post-local-dry-run`.

`npm run worker:post:dry-run:local` makes the local dry-run worker consume `rbhq-post-local-dry-run`.

The dry-run worker only validates and logs the approved TikTok payload. It must not be used to wire live TikTok posting.

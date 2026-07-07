export type RbhqSourceType =
  | "watchlist"
  | "upload_folder"
  | "manual_upload"
  | "trend_research"
  | "topic_monitor"
  | "clip_bucket";

export type RbhqSourceStatus = "ready" | "needs_review" | "blocked";

export type RbhqSource = {
  id: string;
  name: string;
  channelId: string;
  channelDbId: string;
  channelLabel: string;
  handle?: string;
  sourceType: RbhqSourceType;
  platform: "TikTok" | "Manual" | "Internal";
  status: RbhqSourceStatus;
  requirement: {
    width: 1080;
    height: 1920;
    aspectRatio: "9:16";
  };
  lastCheckedLabel: string;
  notes?: string;
};

export const RBHQ_SOURCES: RbhqSource[] = [
  // rb_sports — @runnitbacksports
  {
    id: "src-sports-watchlist",
    name: "RB Sports Watchlist",
    channelId: "rb_sports",
    channelDbId: "a1000000-0000-0000-0000-000000000001",
    channelLabel: "rb sports",
    handle: "@runnitbacksports",
    sourceType: "watchlist",
    platform: "TikTok",
    status: "ready",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "2 min ago",
  },
  {
    id: "src-sports-clips",
    name: "Sports Clip Bucket",
    channelId: "rb_sports",
    channelDbId: "a1000000-0000-0000-0000-000000000001",
    channelLabel: "rb sports",
    handle: "@runnitbacksports",
    sourceType: "clip_bucket",
    platform: "Manual",
    status: "needs_review",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "14 min ago",
    notes: "3 clips awaiting format check",
  },
  // rb_arena — @runnitbackgaming
  {
    id: "src-arena-trend",
    name: "Arena Trend Feed",
    channelId: "rb_arena",
    channelDbId: "a1000000-0000-0000-0000-000000000002",
    channelLabel: "Gaming / Esports",
    handle: "@runnitbackgaming",
    sourceType: "trend_research",
    platform: "TikTok",
    status: "ready",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "5 min ago",
  },
  {
    id: "src-arena-uploads",
    name: "Gaming Upload Queue",
    channelId: "rb_arena",
    channelDbId: "a1000000-0000-0000-0000-000000000002",
    channelLabel: "Gaming / Esports",
    handle: "@runnitbackgaming",
    sourceType: "upload_folder",
    platform: "Manual",
    status: "blocked",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "1 hr ago",
    notes: "Wrong aspect ratio — clips submitted at 16:9",
  },
  // rb_women
  {
    id: "src-women-intake",
    name: "Women's Lane Intake",
    channelId: "rb_women",
    channelDbId: "a1000000-0000-0000-0000-000000000004",
    channelLabel: "rb women",
    sourceType: "clip_bucket",
    platform: "Internal",
    status: "ready",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "8 min ago",
  },
  {
    id: "src-women-monitor",
    name: "Women's Topic Monitor",
    channelId: "rb_women",
    channelDbId: "a1000000-0000-0000-0000-000000000004",
    channelLabel: "rb women",
    sourceType: "topic_monitor",
    platform: "TikTok",
    status: "needs_review",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "22 min ago",
    notes: "Audio trend flagged for review",
  },
  // rb_combat — @runnitbackcombatsports
  {
    id: "src-combat-watchlist",
    name: "Combat Watchlist",
    channelId: "rb_combat",
    channelDbId: "a1000000-0000-0000-0000-000000000003",
    channelLabel: "rb combat",
    handle: "@runnitbackcombatsports",
    sourceType: "watchlist",
    platform: "TikTok",
    status: "ready",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "3 min ago",
  },
  {
    id: "src-combat-manual",
    name: "Combat Manual Upload",
    channelId: "rb_combat",
    channelDbId: "a1000000-0000-0000-0000-000000000003",
    channelLabel: "rb combat",
    handle: "@runnitbackcombatsports",
    sourceType: "manual_upload",
    platform: "Manual",
    status: "blocked",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "2 hr ago",
    notes: "File rejected — needs resize to 1080×1920",
  },
  // rb_futbol — @runnitbackfutbol1
  {
    id: "src-futbol-feed",
    name: "Futbol Discovery Feed",
    channelId: "rb_futbol",
    channelDbId: "a1000000-0000-0000-0000-000000000005",
    channelLabel: "rb futbol",
    handle: "@runnitbackfutbol1",
    sourceType: "watchlist",
    platform: "TikTok",
    status: "ready",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "1 min ago",
  },
  {
    id: "src-futbol-clips",
    name: "Futbol Clip Bucket",
    channelId: "rb_futbol",
    channelDbId: "a1000000-0000-0000-0000-000000000005",
    channelLabel: "rb futbol",
    handle: "@runnitbackfutbol1",
    sourceType: "clip_bucket",
    platform: "Manual",
    status: "needs_review",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "35 min ago",
    notes: "2 clips need resize to vertical",
  },
  // rb_cfb — college football
  {
    id: "src-cfb-watchlist",
    name: "CFB Watchlist",
    channelId: "rb_cfb",
    channelDbId: "93484eef-06d8-46fd-bce2-ce252422c58e",
    channelLabel: "rb cfb",
    sourceType: "watchlist",
    platform: "TikTok",
    status: "ready",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "7 min ago",
  },
  {
    id: "src-cfb-audio",
    name: "CFB Audio Research",
    channelId: "rb_cfb",
    channelDbId: "93484eef-06d8-46fd-bce2-ce252422c58e",
    channelLabel: "rb cfb",
    sourceType: "trend_research",
    platform: "Internal",
    status: "needs_review",
    requirement: { width: 1080, height: 1920, aspectRatio: "9:16" },
    lastCheckedLabel: "45 min ago",
    notes: "New trend sounds flagged for approval",
  },
];

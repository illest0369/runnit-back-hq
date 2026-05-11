export type ClipSource = "nba" | "nfl" | "mlb" | "talk" | "culture";

export type ModerationStatus = "pending" | "approved" | "rejected";
export type PublishStatus = "not_ready" | "ready_for_manual_publish";

export type Clip = {
  id: string;
  source: ClipSource;
  title: string;
  hook: string;
  creator: string;
  duration: string;
  capturedAt: string;
  score: number;
  momentum: string;
  tags: string[];
  transcript: string;
  posterGradient: string;
  accent: string;
};

export type SourceMeta = {
  id: ClipSource;
  label: string;
  shortLabel: string;
  color: string;
};

export const sources: SourceMeta[] = [
  { id: "nba", label: "NBA", shortLabel: "NBA", color: "#39ff14" },
  { id: "nfl", label: "NFL", shortLabel: "NFL", color: "#00d5ff" },
  { id: "mlb", label: "MLB", shortLabel: "MLB", color: "#ffcc00" },
  { id: "talk", label: "Talk", shortLabel: "TK", color: "#ff3b30" },
  { id: "culture", label: "Culture", shortLabel: "CU", color: "#af52de" },
];

export const clips: Clip[] = [
  {
    id: "rb-001",
    source: "nba",
    title: "Buzzer-beater bench eruption",
    hook: "The whole sideline knows it before the ball drops.",
    creator: "@runnitbacksports",
    duration: "0:18",
    capturedAt: "2m ago",
    score: 94,
    momentum: "+31%",
    tags: ["clutch", "bench", "basketball"],
    transcript: "He lets it fly from the logo and the bench is already halfway onto the court.",
    posterGradient: "from-lime-400 via-emerald-500 to-black",
    accent: "#39ff14",
  },
  {
    id: "rb-002",
    source: "nfl",
    title: "Tunnel walk with playoff lights",
    hook: "Smoke, strobes, and a captain walking like the room belongs to him.",
    creator: "@runnitbacksports",
    duration: "0:22",
    capturedAt: "7m ago",
    score: 88,
    momentum: "+19%",
    tags: ["walkout", "playoffs", "hype"],
    transcript: "The lights cut low and the tunnel turns into a runway.",
    posterGradient: "from-cyan-400 via-blue-700 to-black",
    accent: "#00d5ff",
  },
  {
    id: "rb-003",
    source: "nba",
    title: "No-look dime in transition",
    hook: "The guard sells the layup, then drops the pass into a window nobody else saw.",
    creator: "@runnitbacksports",
    duration: "0:16",
    capturedAt: "11m ago",
    score: 91,
    momentum: "+27%",
    tags: ["assist", "transition", "handles"],
    transcript: "The defender bites for half a second and the pass lands perfectly in stride.",
    posterGradient: "from-orange-400 via-red-500 to-black",
    accent: "#ff3b30",
  },
  {
    id: "rb-004",
    source: "nfl",
    title: "Counter route shakes the safety",
    hook: "Tiny shoulder fake, huge momentum swing.",
    creator: "@runnitbacksports",
    duration: "0:13",
    capturedAt: "14m ago",
    score: 86,
    momentum: "+22%",
    tags: ["route", "separation", "slowmo"],
    transcript: "The stem freezes the safety and the receiver snaps into open grass.",
    posterGradient: "from-blue-500 via-cyan-500 to-black",
    accent: "#ff3b30",
  },
  {
    id: "rb-005",
    source: "nba",
    title: "Ankle-break into corner three",
    hook: "Crowd audio spikes before the shot even leaves his hand.",
    creator: "@runnitbacksports",
    duration: "0:20",
    capturedAt: "19m ago",
    score: 90,
    momentum: "+24%",
    tags: ["handles", "three", "crowd"],
    transcript: "One hard cross sends the defender sliding, then the kickout is automatic.",
    posterGradient: "from-green-300 via-lime-500 to-zinc-950",
    accent: "#39ff14",
  },
  {
    id: "rb-006",
    source: "culture",
    title: "Mascot dives into student section",
    hook: "Absurd, loud, perfect for the late-night feed.",
    creator: "@runnitbacksports",
    duration: "0:15",
    capturedAt: "25m ago",
    score: 82,
    momentum: "+12%",
    tags: ["crowd", "mascot", "chaos"],
    transcript: "The mascot points at the student section and commits fully.",
    posterGradient: "from-sky-300 via-indigo-600 to-black",
    accent: "#00d5ff",
  },
  {
    id: "rb-007",
    source: "mlb",
    title: "Diving grab turns into relay",
    hook: "Full-extension catch, instant throw, clean tag sequence.",
    creator: "@runnitbacksports",
    duration: "0:19",
    capturedAt: "31m ago",
    score: 89,
    momentum: "+18%",
    tags: ["defense", "baseball", "relay"],
    transcript: "The outfielder lays out, pops up fast, and the relay beats the runner by a step.",
    posterGradient: "from-yellow-300 via-orange-600 to-black",
    accent: "#ffcc00",
  },
  {
    id: "rb-008",
    source: "talk",
    title: "Panel loses it over trade rumor",
    hook: "One throwaway line turns the whole room into a debate.",
    creator: "@runnitbacksports",
    duration: "0:17",
    capturedAt: "36m ago",
    score: 84,
    momentum: "+15%",
    tags: ["debate", "rumor", "reaction"],
    transcript: "The host drops the rumor and every mic lights up at once.",
    posterGradient: "from-red-400 via-zinc-800 to-black",
    accent: "#ff3b30",
  },
];

export function getClipById(clipId: string) {
  return clips.find((clip) => clip.id === clipId);
}

export function getSourceMeta(source: ClipSource) {
  return sources.find((item) => item.id === source) ?? sources[0];
}

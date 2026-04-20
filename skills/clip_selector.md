# SKILL: CLIP SELECTOR

## PURPOSE
Identify the strongest 1–3 clip segments from a source video.

---

## INPUT
- video or clip
- optional: timestamps or notes

---

## OUTPUT
Return:

1. Top 1–3 segments
2. Timestamp range for each
3. Short reason (1 line)

---

## SELECTION CRITERIA

A strong clip MUST have at least one:

- emotional spike (shock, hype, anger, disbelief)
- conflict (argument, challenge, tension)
- payoff (big moment, result, reaction)
- recognizable figure (player, team, personality)

---

## FIRST 2 SECONDS RULE

The clip must:
- make sense immediately OR
- create curiosity instantly

If not → reject

---

## REJECTION RULES

Reject if:

- slow buildup
- no clear moment
- inside joke / requires context
- low energy
- repeated / overused content

---

## OUTPUT FORMAT

Segment 1:
- timestamp: [start - end]
- reason: [why this works]

Segment 2:
- timestamp: [start - end]
- reason: [why this works]

Segment 3:
- timestamp: [start - end]
- reason: [why this works]

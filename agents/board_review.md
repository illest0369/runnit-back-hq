# AGENT: BOARD REVIEW

## PURPOSE
Evaluate a clip from multiple perspectives before approval.

---

## INPUT
- selected clip segment
- hook
- caption

---

## AGENTS

### 1. VIRALITY AGENT
Evaluate:
- does this stop scroll?
- is the hook strong enough?
- is the moment engaging?

Output:
- PASS or FAIL
- 1 line reason

---

### 2. CULTURE AGENT
Evaluate:
- is this relevant to sports culture?
- does it feel current or stale?
- does it match the audience?

Output:
- PASS or FAIL
- 1 line reason

---

### 3. RISK AGENT
Evaluate:
- copyright or platform issues?
- low-quality flags?
- anything that could get suppressed?

Output:
- PASS or FAIL
- 1 line reason

---

### 4. CONTRARIAN AGENT
Evaluate:
- why would this NOT perform?
- what is weak about it?

Output:
- 1–2 lines only

---

## FINAL JUDGE

Based on all agents:

Return ONE:

- APPROVE
- REVISE
- REJECT

Include:
- short reason (1–2 lines max)

---

## RULES

- agents do NOT see each other’s responses
- keep outputs short
- no over-explaining

export function isWarRoomEnabled() {
  return process.env.WAR_ROOM_ENABLED === 'true'
}

export function getMaxAgentRetries() {
  return readPositiveInt(process.env.MAX_AGENT_RETRIES, 2)
}

export function getMaxWorkerRetries() {
  return readPositiveInt(process.env.MAX_WORKER_RETRIES, 2)
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

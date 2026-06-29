export function isProductionBuild(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}


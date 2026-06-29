import {
  buildLearningWeights,
  buildReplyLearningContext,
  type LearningWeight,
  type ReplyLearningContext,
} from '../lib/runnitback'

type LearningComputation = {
  weights: LearningWeight[]
  context: ReplyLearningContext
}

async function computeLearning(): Promise<LearningComputation> {
  const weights = buildLearningWeights([])

  return {
    weights,
    context: buildReplyLearningContext({
      weights,
      successfulRepliesByType: {},
    }),
  }
}

export async function getReplyLearningContext(): Promise<ReplyLearningContext> {
  const computed = await computeLearning()
  return computed.context
}

export async function refreshLearningWeights(): Promise<LearningWeight[]> {
  const computed = await computeLearning()
  return computed.weights
}

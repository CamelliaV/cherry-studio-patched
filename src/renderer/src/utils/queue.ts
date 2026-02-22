import { endTrace } from '@renderer/services/SpanManagerService'
import PQueue from 'p-queue'

// Queue configuration - managed by topic
const requestQueues: { [topicId: string]: PQueue } = {}
type TopicQueueOptions = ConstructorParameters<typeof PQueue>[0]
const DEFAULT_TOPIC_QUEUE_OPTIONS: TopicQueueOptions = {
  concurrency: 1
}
const normalizeQueueConcurrency = (concurrency?: number) => {
  if (!Number.isFinite(concurrency)) {
    return DEFAULT_TOPIC_QUEUE_OPTIONS.concurrency!
  }

  return Math.max(1, Math.floor(concurrency as number))
}

/**
 * Get or create a queue for a specific topic
 * @param topicId The ID of the topic
 * @param options
 * @returns A PQueue instance for the topic
 */
export const getTopicQueue = (topicId: string, options: TopicQueueOptions = {}): PQueue => {
  if (!requestQueues[topicId]) {
    requestQueues[topicId] = new PQueue({ ...DEFAULT_TOPIC_QUEUE_OPTIONS, ...options }).addListener('idle', () => {
      endTrace({ topicId })
    })
  }
  return requestQueues[topicId]
}

/**
 * Update queue concurrency for a specific topic.
 * Creates queue when missing.
 */
export const setTopicQueueConcurrency = (topicId: string, concurrency: number): PQueue => {
  const normalizedConcurrency = normalizeQueueConcurrency(concurrency)
  const queue = getTopicQueue(topicId, { concurrency: normalizedConcurrency })

  if (queue.concurrency !== normalizedConcurrency) {
    queue.concurrency = normalizedConcurrency
  }

  return queue
}

/**
 * Clear the queue for a specific topic
 * @param topicId The ID of the topic
 */
export const clearTopicQueue = (topicId: string): void => {
  if (requestQueues[topicId]) {
    requestQueues[topicId].clear()
    delete requestQueues[topicId]
  }
}

/**
 * Clear all topic queues
 */
export const clearAllQueues = (): void => {
  Object.keys(requestQueues).forEach((topicId) => {
    requestQueues[topicId].clear()
    delete requestQueues[topicId]
  })
}

/**
 * Check if a topic has pending requests
 * @param topicId The ID of the topic
 * @returns True if the topic has pending requests
 */
export const hasTopicPendingRequests = (topicId: string): boolean => {
  return requestQueues[topicId]?.size > 0 || requestQueues[topicId]?.pending > 0
}

/**
 * Get the number of pending requests for a topic
 * @param topicId The ID of the topic
 * @returns The number of pending requests
 */
export const getTopicPendingRequestCount = (topicId: string): number => {
  if (!requestQueues[topicId]) {
    return 0
  }
  return requestQueues[topicId].size + requestQueues[topicId].pending
}

/**
 * Wait for all pending requests in a topic queue to complete
 * @param topicId The ID of the topic
 */
export const waitForTopicQueue = async (topicId: string): Promise<void> => {
  if (requestQueues[topicId]) {
    await requestQueues[topicId].onIdle()
  }
}

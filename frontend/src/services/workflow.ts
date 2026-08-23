import { apiFetch } from './api'
import type { Proposal, ApprovalRequest, LinkedInAction, ContractCheck } from '../types/workflow'
import type { Post, ReviewResult, AuditLogEntry } from '../types/posts'

export interface AgentReply {
  kind: 'plan' | 'review' | 'proposal_created' | 'questions' | 'post_draft' | 'info'
  text: string
  data?: unknown
}

export interface CommandResponse {
  sessionId: string
  intent: string
  reply: AgentReply
  proposalId?: string
  postId?: string
}

export const proposalsService = {
  list(): Promise<{ proposals: Proposal[] }> {
    return apiFetch('/api/proposals')
  },
  get(id: string): Promise<{ proposal: Proposal }> {
    return apiFetch(`/api/proposals/${id}`)
  },
  approve(
    id: string,
    scope: { approvedActionIds?: string[]; rejectedActionIds?: string[] },
  ): Promise<{
    approvalRequest: { id: string; status: string; approvedActionIds: string[]; rejectedActionIds: string[] }
    queue: { approved: number; rejected: number }
  }> {
    return apiFetch(`/api/proposals/${id}/approve`, { method: 'POST', body: JSON.stringify(scope) })
  },
  reject(id: string): Promise<{ proposal: Proposal }> {
    return apiFetch(`/api/proposals/${id}/reject`, { method: 'POST' })
  },
  edit(id: string, edits: Array<{ field: string; after: string }>): Promise<{ proposal: Proposal }> {
    return apiFetch(`/api/proposals/${id}/edit`, {
      method: 'POST',
      body: JSON.stringify({ edits }),
    })
  },
}

export const approvalsService = {
  list(status?: ApprovalRequest['status']): Promise<{ approvals: ApprovalRequest[] }> {
    return apiFetch(`/api/approvals${status ? `?status=${status}` : ''}`)
  },
}

export const actionsService = {
  list(): Promise<{ actions: LinkedInAction[] }> {
    return apiFetch('/api/linkedin/actions')
  },
  execute(
    id: string,
  ): Promise<{
    executed: boolean
    status: string
    result: string | null
    reason: string | null
    checklist: ContractCheck[]
  }> {
    return apiFetch(`/api/linkedin/actions/${id}/execute`, { method: 'POST', body: '{}' })
  },
  runQueue(): Promise<{
    processed: Array<{ actionId: string; status: string; detail?: string }>
    pausedRemaining: string[]
    stoppedReason?: string
  }> {
    return apiFetch('/api/linkedin/execution/run', { method: 'POST', body: '{}' })
  },
  retry(id: string): Promise<{ action: LinkedInAction }> {
    return apiFetch(`/api/linkedin/actions/${id}/retry`, { method: 'POST' })
  },
  skip(id: string): Promise<{ action: LinkedInAction }> {
    return apiFetch(`/api/linkedin/actions/${id}/skip`, { method: 'POST' })
  },
  cancel(id: string): Promise<{ action: LinkedInAction }> {
    return apiFetch(`/api/linkedin/actions/${id}/cancel`, { method: 'POST' })
  },
}

export const postsService = {
  list(): Promise<{ posts: Post[] }> {
    return apiFetch('/api/posts')
  },
  create(payload: { text: string; title?: string }): Promise<{ post: Post }> {
    return apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(payload) })
  },
  update(id: string, text: string): Promise<{ post: Post }> {
    return apiFetch(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ text }) })
  },
  review(id: string): Promise<{ post: Post }> {
    return apiFetch(`/api/posts/${id}/review`, { method: 'POST', body: '{}' })
  },
  requestPublish(id: string): Promise<{ post: Post }> {
    return apiFetch(`/api/posts/${id}/publish-request`, { method: 'POST', body: '{}' })
  },
  confirmPublish(id: string): Promise<{ post: Post }> {
    return apiFetch(`/api/posts/${id}/publish-confirm`, { method: 'POST', body: '{}' })
  },
}

export const agentService = {
  command(command: string, sessionId?: string): Promise<CommandResponse> {
    return apiFetch('/api/agent/command', {
      method: 'POST',
      body: JSON.stringify(sessionId ? { command, sessionId } : { command }),
    })
  },
}

export const logsService = {
  list(): Promise<{ logs: AuditLogEntry[] }> {
    return apiFetch('/api/logs')
  },
}

export const reviewsService = {
  list(): Promise<{ reviews: ReviewResult[] }> {
    return apiFetch('/api/reviews')
  },
}

import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../audit/audit.service.js'
import { ApiError } from '../errors/apiError.js'
import { AgentCommandModel, AgentSessionModel, type AgentSessionDocument } from '../domain/sessions/session.model.js'
import { detectIntent, projectQuestions, skillQuestions, type AgentIntent } from './intents.js'
import { buildSetupPlan } from './planner.js'
import { runProfileReview } from './reviewer.js'
import { createImprovementProposal, toProposalDTO } from '../domain/proposal/proposal.service.js'
import { createDraftByOwner } from '../domain/posts/post.service.js'
import { getProfileSnapshotOrEmpty } from '../domain/profile/profile.service.js'
import { findManyByOwner } from '../domain/profile-facts/profileFact.repository.js'
import { AUTHORITATIVE_TYPES } from '../domain/profile-facts/profileFact.types.js'
import { PROFILE_SECTIONS } from '../domain/profile/profile.types.js'

export interface AgentReply {
  kind: 'plan' | 'review' | 'proposal_created' | 'questions' | 'post_draft' | 'info'
  text: string
  data?: unknown
}

export interface CommandResult {
  sessionId: string
  intent: AgentIntent
  reply: AgentReply
  proposalId?: string
  postId?: string
}

async function ensureSession(userId: string, sessionId?: string): Promise<AgentSessionDocument> {
  if (sessionId) {
    const existing = await AgentSessionModel.findOne({ _id: sessionId, userId }).exec()
    if (existing) return existing
    // unknown/expired session ids start a fresh session instead of failing silently
  }
  return AgentSessionModel.create({ userId })
}

/**
 * Builds a post draft using ONLY verified facts. If none exist → questions (flow.md §3.1).
 * The draft is never published — it enters the normal post lifecycle.
 */
function buildPostDraftFromFacts(
  facts: Array<{ key: string; valueText: string }>,
  topic: string,
): string | null {
  if (facts.length === 0) return null
  const byKey = new Map(facts.map((f) => [f.key.toLowerCase(), f.valueText]))
  const skills =
    facts
      .filter((f) => ['skill', 'typescript', 'angular', 'node', 'technology'].some((k) => f.key.toLowerCase().includes(k)))
      .map((f) => f.valueText)
      .join(', ') || byKey.get('role') || ''
  const role = byKey.get('role') ?? ''
  const company = byKey.get('company') ?? ''
  const lines: string[] = []
  if (topic) lines.push(`Working on ${topic}.`)
  if (role) lines.push(`Currently: ${role}${company ? ` at ${company}` : ''}.`)
  if (skills) lines.push(`Core stack: ${skills}.`)
  lines.push('(Draft built strictly from your verified facts — edit freely before review.)')
  return lines.join('\n')
}

export async function handleAgentCommand(
  userId: string,
  rawCommand: string,
  sessionId?: string,
): Promise<CommandResult> {
  const command = rawCommand.trim().slice(0, 2000)
  if (!command) throw ApiError.validation('command must not be empty')

  const session = await ensureSession(userId, sessionId)
  const { intent, section } = detectIntent(command)

  let reply: AgentReply
  let proposalId: string | undefined
  let postId: string | undefined

  switch (intent) {
    case 'setup_profile': {
      const snapshot = await getProfileSnapshotOrEmpty(userId)
      const plan = buildSetupPlan(snapshot)
      reply = {
        kind: 'plan',
        text:
          'LINKEDIN SETUP PLAN\n\n' +
          plan.items
            .map((i) => `${i.quality === 'missing' ? '+' : i.quality === 'weak' ? '⚠' : '✓'} ${i.section} (${i.quality})`)
            .join('\n') +
          `\n\nStatus: ${plan.status}\n${plan.note}`,
        data: plan,
      }
      break
    }
    case 'review_profile':
    case 'review_section': {
      const target = section ?? 'profile'
      const review = await runProfileReview(userId, target as never)
      reply = {
        kind: 'review',
        text: `Review of "${target}" complete. Overall score ${review.overall}/100 (AI evaluation).`,
        data: review.toJSON(),
      }
      break
    }
    case 'improve_section': {
      if (!section) {
        reply = {
          kind: 'questions',
          text: `Which section should I improve? Options: ${PROFILE_SECTIONS.join(', ')}.`,
        }
        break
      }
      try {
        const proposal = await createImprovementProposal(userId, { target: section })
        proposalId = proposal.id
        const dto = toProposalDTO(proposal)
        if (dto.state === 'waiting_for_approval') {
          reply = {
            kind: 'proposal_created',
            text: `Proposal generated for "${section}". Status: WAITING_FOR_APPROVAL — nothing touches LinkedIn until you approve it.`,
            data: dto,
          }
        } else {
          reply = {
            kind: 'questions',
            text:
              'I found statements I cannot verify in the improved version. Confirm or correct these facts first:\n' +
              JSON.stringify(dto.factValidation, null, 2).slice(0, 1500),
            data: dto,
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'MISSING_INFORMATION') {
          reply = { kind: 'questions', text: err.message }
          break
        }
        throw err
      }
      break
    }
    case 'add_project': {
      reply = {
        kind: 'questions',
        text: 'Saya butuh beberapa informasi sebelum menambahkan project (flow.md §22):\n' + projectQuestions().join('\n'),
      }
      break
    }
    case 'add_skill': {
      reply = {
        kind: 'questions',
        text: skillQuestions().join('\n'),
      }
      break
    }
    case 'create_post_draft': {
      const factDocs = await findManyByOwner(userId, { status: 'verified' }, 200)
      const facts = factDocs
        .filter((d) => AUTHORITATIVE_TYPES.includes(d.type))
        .map((d) => ({
          key: d.key,
          valueText:
            typeof d.value === 'string'
              ? d.value
              : Array.isArray(d.value)
                ? d.value.join(', ')
                : String(d.value ?? ''),
        }))
      const topicMatch = command.match(/(?:tentang|about|on)\s+(.+)$/i)
      const topic = topicMatch ? topicMatch[1].trim() : ''
      const draftText = buildPostDraftFromFacts(facts, topic)
      if (!draftText) {
        reply = {
          kind: 'questions',
          text: 'I have no verified facts to write a post from yet. Share some facts first (role, company, technologies) — I will not invent content.',
        }
        break
      }
      const post = await createDraftByOwner(userId, { text: draftText.slice(0, 2900), title: topic || null })
      postId = post.id
      reply = {
        kind: 'post_draft',
        text: 'Draft created (DRAFT state, not published). Run its fact check, edit if you like, and only then request publishing with explicit confirmation.',
        data: post.toJSON(),
      }
      break
    }
    case 'publish_post_request': {
      reply = {
        kind: 'info',
        text: 'Publishing requires explicit confirmation. Open Posts, pick a validated final draft, then use Publish request → Approve → Publish confirm. Nothing goes public without those steps.',
      }
      break
    }
    default: {
      reply = {
        kind: 'questions',
        text:
          'I did not understand that command. Try:\n' +
          '- "Setup LinkedIn gue."\n' +
          '- "Review About gue."\n' +
          '- "Improve headline."\n' +
          '- "Buat post tentang LifeHub."\n' +
          '- "Tambah project." / "Tambah skill."',
      }
    }
  }

  session.lastIntent = intent
  session.lastTarget = section ?? null
  if (proposalId) {
    session.recentProposalIds = [proposalId, ...session.recentProposalIds].slice(0, 10)
  }
  if (postId) {
    session.recentPostIds = [postId, ...session.recentPostIds].slice(0, 10)
  }
  await session.save()

  const sid = String(session._id)
  await AgentCommandModel.create({
    userId,
    sessionId: sid,
    command,
    intent,
    replyKind: reply.kind,
    proposalId: proposalId ?? null,
    postId: postId ?? null,
  })

  await appendAuditEvent({
    userId,
    actionType: 'agent.command',
    entityType: 'agent_session',
    entityId: sid,
    before: null,
    after: { command: command.slice(0, 300), intent, replyKind: reply.kind },
  })

  return { sessionId: sid, intent, reply, proposalId, postId }
}

export function newSessionId(): string {
  return randomUUID()
}

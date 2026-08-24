import { useRef, useState } from 'react'
import { agentService } from '../services/workflow'
import type { AgentReply } from '../services/workflow'
import type { Proposal } from '../types/workflow'
import { DiffView } from '../components/DiffView'
import type { FieldDiff } from '../types/profile'
import { proposalsService } from '../services/workflow'

interface ChatMessage {
  role: 'user' | 'agent'
  text: string
  data?: unknown
}

const SUGGESTIONS = [
  'Improve my headline',
  'Make my About section more professional',
  'Review my LinkedIn profile',
  'Create a professional post about my recent project',
]

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function send(command: string) {
    const trimmed = command.trim()
    if (!trimmed || busy) return
    push({ role: 'user', text: trimmed })
    setInput('')
    setBusy(true)
    try {
      const result = await agentService.command(trimmed, sessionId)
      setSessionId(result.sessionId)
      push({ role: 'agent', text: result.reply.text, data: result.reply })
    } catch (e) {
      push({ role: 'agent', text: e instanceof Error ? e.message : 'Command failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col space-y-6">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ agent</p>
        <h1 className="text-2xl font-bold tracking-tight">LinkedIn Assistant</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Tell me what you want to change or improve.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 space-y-4 overflow-y-auto border border-[var(--color-border)] bg-[var(--color-surface)] p-4" style={{ minHeight: 300 }}>
        {messages.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Start with a command.
          </p>
        )}
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="ml-auto max-w-lg border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 text-sm text-[var(--color-text)]">
              <span className="mr-1 text-[var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>$</span>
              {msg.text}
            </div>
          ) : (
            <AgentReplyBlock key={i} reply={msg.data as AgentReply} fallbackText={msg.text} />
          ),
        )}
        {busy && (
          <p className="animate-pulse text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            assistant is thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex gap-2"
      >
        <span className="self-center text-[var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>$</span>
        <input
          aria-label="command"
          placeholder='What would you like to do?'
          className="flex-1 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          style={{ fontFamily: 'var(--font-mono)' }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

function AgentReplyBlock({
  reply,
  fallbackText,
}: {
  reply?: AgentReply
  fallbackText: string
}) {
  async function approveProposal() {
    if (!reply?.data) return
    const proposal = reply.data as Proposal | undefined
    if (!proposal?.id) return
    try {
      await proposalsService.approve(proposal.id, {})
    } catch (e) {
      // approval failed
    }
  }

  async function rejectProposal() {
    if (!reply?.data) return
    const proposal = reply.data as Proposal | undefined
    if (!proposal?.id) return
    try {
      await proposalsService.reject(proposal.id)
    } catch (e) {
      // rejection failed
    }
  }

  function renderSuggestedVersion(replyData: unknown) {
    const proposal = replyData as Proposal | undefined
    if (!proposal?.changes?.length) return null

    const headlineChange = proposal.changes.find((c) => c.field === 'headline')
    const headlineBefore = headlineChange ? (headlineChange.before as string) : ''
    const headlineAfter = headlineChange ? (headlineChange.after as string) : ''

    return (
      <div className="max-w-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="text-sm font-medium mb-2">I can help with that. Here's my suggested version:</p>

        <div className="mt-4 space-y-3">
          <p className="text-base font-medium">HEADLINE</p>

          <div className="border border-[var(--color-border)] p-3 rounded mb-3">
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">Current:</p>
            <p className="text-lg font-mono break-all">{headlineBefore || '(current headline)'}</p>
          </div>

          {headlineChange && (
            <div className="border border-[var(--color-border)] p-3 rounded">
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">Suggested:</p>
              <p className="text-lg font-mono break-all">{headlineAfter}</p>
            </div>
          )}

          {headlineChange && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Clearer and more focused on your technical skills.
            </p>
          )}

          {proposal.changes.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <button
                onClick={() => approveProposal()}
                className="border border-green-600 bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => rejectProposal()}
                className="border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-secondary)] hover:border-red-300 hover:text-red-600"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderProposalData(data: unknown) {
    const proposal = data as Proposal | undefined
    if (!proposal?.changes?.length) return null

    const diffs: FieldDiff[] = proposal.changes.map((c) => ({
      field: c.field,
      before: c.before,
      after: c.after,
    }))
    const fv = proposal.factValidation
    return (
      <div className="mt-3 space-y-3">
        <DiffView changes={diffs} />
        {fv && (
          <div className="border border-[var(--color-border)] p-2 text-xs">
            <p
              className={fv.isReady ? 'text-green-600' : 'text-amber-600'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              fact check: {fv.supportedCount} supported · {fv.unsupportedCount} unsupported ·{ ' '}{fv.needsConfirmationCount} need confirmation
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      {!reply ? (
        <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{fallbackText}</p>
      ) : (
        <>
          <span
            className="mb-2 inline-block border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {reply.kind}
          </span>
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{reply.text}</p>

          {(reply.kind === 'proposal_created' || reply.kind === 'questions') &&
            renderProposalData(reply.data)}

          {reply.kind === 'proposal_created' && (reply.data as Proposal)?.state === 'waiting_for_approval' && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => approveProposal()}
                className="border border-green-600 bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => rejectProposal()}
                className="border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-secondary)] hover:border-red-300 hover:text-red-600"
              >
                Reject
              </button>
            </div>
          )}

          {renderSuggestedVersion(reply.data)}

          {reply.kind === 'plan' && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Plan only — nothing executed. Use "improve headline" to generate an approvable proposal.
            </p>
          )}
        </>
      )}
    </div>
  )
}
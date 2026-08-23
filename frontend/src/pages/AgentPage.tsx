import { useRef, useState } from 'react'
import { agentService, proposalsService } from '../services/workflow'
import type { AgentReply } from '../services/workflow'
import type { Proposal } from '../types/workflow'
import { DiffView } from '../components/DiffView'
import type { FieldDiff } from '../types/profile'

interface ChatMessage {
  role: 'user' | 'agent'
  text: string
  data?: unknown
}

const SUGGESTIONS = [
  'Setup LinkedIn gue.',
  'Review About gue.',
  'Improve headline.',
  'Buat post tentang LifeHub.',
  'Tambah project.',
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
    <div className="flex h-full flex-col space-y-4">
      <header>
        <h2 className="text-xl font-bold">AI Agent</h2>
        <p className="text-sm text-slate-500">
          Natural language is the interface — structured approval is the only authorization.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-sky-600 hover:text-sky-300"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">
            Start with a command. Every proposal waits for your explicit approval.
          </p>
        )}
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="ml-auto max-w-lg rounded-lg bg-sky-900/40 px-3 py-2 text-sm text-sky-100">
              {msg.text}
            </div>
          ) : (
            <AgentReplyBlock key={i} reply={msg.data as AgentReply} fallbackText={msg.text} />
          ),
        )}
        {busy && <p className="animate-pulse text-xs text-slate-500">Agent is thinking…</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex gap-2"
      >
        <input
          aria-label="command"
          placeholder='Type a command, e.g. "Improve my About section."'
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-sky-600 px-5 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
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
  const [approved, setApproved] = useState<string | null>(null)

  async function decide(proposalId: string, decision: 'approve' | 'reject') {
    try {
      if (decision === 'approve') {
        await proposalsService.approve(proposalId, {})
        setApproved('approved — actions queued')
      } else {
        await proposalsService.reject(proposalId)
        setApproved('rejected')
      }
    } catch (e) {
      setApproved(e instanceof Error ? e.message : 'decision failed')
    }
  }

  return (
    <div className="max-w-2xl rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-3">
      {!reply ? (
        <p className="whitespace-pre-wrap text-sm text-slate-200">{fallbackText}</p>
      ) : (
        <>
          <span className="mb-2 inline-block rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-400">
            {reply.kind}
          </span>
          <p className="whitespace-pre-wrap text-sm text-slate-100">{reply.text}</p>

          {(reply.kind === 'proposal_created' || reply.kind === 'questions') &&
            renderProposalData(reply.data)}

          {reply.kind === 'proposal_created' && (reply.data as Proposal)?.state === 'waiting_for_approval' && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide((reply.data as Proposal).id, 'approve')}
                className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium hover:bg-emerald-600"
              >
                Approve all
              </button>
              <button
                onClick={() => decide((reply.data as Proposal).id, 'reject')}
                className="rounded bg-rose-800 px-3 py-1 text-sm hover:bg-rose-700"
              >
                Reject
              </button>
            </div>
          )}
          {approved && <p className="mt-2 text-sm text-emerald-400">{approved}</p>}

          {reply.kind === 'plan' && (
            <p className="mt-2 text-xs text-slate-500">
              Plan only — nothing executed. Use "improve &lt;section&gt;" to generate an approvable
              proposal.
            </p>
          )}
        </>
      )}
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
        <div className="rounded border border-slate-800 p-2 text-xs">
          <p className={fv.isReady ? 'text-emerald-400' : 'text-amber-300'}>
            Fact check: {fv.supportedCount} supported · {fv.unsupportedCount} unsupported ·{' '}
            {fv.needsConfirmationCount} need confirmation
          </p>
          {fv.claims
            ?.filter((c) => c.status !== 'supported')
            .map((c, i) => (
              <p key={i} className="mt-1 text-slate-400">
                ⚠ {c.claim} — {c.reason}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

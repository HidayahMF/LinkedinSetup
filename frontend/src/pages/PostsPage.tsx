import { useCallback, useEffect, useState } from 'react'
import { postsService } from '../services/workflow'
import type { Post } from '../types/posts'
import type { PostState } from '../types/posts'

const input =
  'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await postsService.list()
      setPosts(data.posts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load posts')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(action: () => Promise<unknown>, successText: string) {
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(successText)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold">Posts</h2>
        <p className="text-sm text-slate-500">
          Lifecycle: draft → AI fact review → final draft → approval → publish confirmation →
          published. Nothing is public without explicit confirmation.
        </p>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-2 font-semibold">New draft</h3>
        <textarea
          aria-label="post text"
          rows={3}
          placeholder="Write your post — only facts you can verify. Metrics without a source will be flagged."
          className={`${input} w-full`}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <button
          onClick={() => run(async () => {
            await postsService.create({ text: newText })
            setNewText('')
          }, 'Draft created')}
          disabled={!newText.trim()}
          className="mt-2 rounded bg-sky-600 px-4 py-1 text-sm hover:bg-sky-500 disabled:opacity-50"
        >
          Create draft
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      <div className="space-y-4">
        {posts.length === 0 && <p className="text-slate-500">No posts yet.</p>}
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onRun={run}
            editingId={editingId}
            setEditingId={setEditingId}
            editText={editText}
            setEditText={setEditText}
            confirmingId={confirmingId}
            setConfirmingId={setConfirmingId}
          />
        ))}
      </div>
    </div>
  )
}

interface PostCardProps {
  post: Post
  onRun: (action: () => Promise<unknown>, successText: string) => Promise<void>
  editingId: string | null
  setEditingId: (id: string | null) => void
  editText: string
  setEditText: (t: string) => void
  confirmingId: string | null
  setConfirmingId: (id: string | null) => void
}

const STATE_TONE: Partial<Record<PostState, string>> = {
  published: 'text-emerald-400',
  unverified: 'text-yellow-300',
  blocked_fact_check: 'text-rose-300',
  waiting_approval: 'text-amber-300',
  publish_confirmed: 'text-amber-200',
}

function PostCard({
  post,
  onRun,
  editingId,
  setEditingId,
  editText,
  setEditText,
  confirmingId,
  setConfirmingId,
}: PostCardProps) {
  const fv = post.factValidation

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`font-mono uppercase ${STATE_TONE[post.state] ?? 'text-slate-300'}`}>
          {post.state}
        </span>
        <span className="text-slate-500">v{post.versionTag}</span>
        {fv && (
          <span className={fv.isReady ? 'text-emerald-400' : 'text-amber-300'}>
            fact check: {fv.supportedCount}✓ {fv.unsupportedCount}✗ {fv.needsConfirmationCount}?
          </span>
        )}
        {post.verificationResult && (
          <span className="font-mono text-slate-500">result: {post.verificationResult}</span>
        )}
      </div>

      {editingId === post.id ? (
        <>
          <textarea
            rows={4}
            aria-label="edit post"
            className={`${input} w-full`}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                onRun(async () => {
                  await postsService.update(post.id, editText)
                  setEditingId(null)
                }, 'Draft updated as a new version')
              }
              className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600"
            >
              Save edit
            </button>
            <button onClick={() => setEditingId(null)} className="text-sm text-slate-400 hover:underline">
              cancel
            </button>
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-100">{post.text}</p>
      )}

      {fv?.claims?.some((c) => c.status !== 'supported') && (
        <ul className="mt-2 space-y-1 rounded border border-slate-800 p-2 text-xs text-amber-300">
          {fv.claims
            .filter((c) => c.status !== 'supported')
            .map((c, i) => (
              <li key={i}>
                ⚠ {c.claim} — {c.reason}
              </li>
            ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => onRun(() => postsService.review(post.id), 'Fact review complete')}
          className="rounded bg-sky-700 px-3 py-1 text-xs hover:bg-sky-600"
        >
          Run fact check
        </button>
        {editingId !== post.id && (
          <button
            onClick={() => {
              setEditingId(post.id)
              setEditText(post.text)
            }}
            className="text-xs text-sky-400 hover:underline"
          >
            edit (new version)
          </button>
        )}
        {post.state === 'final_draft' && !post.publishProposalId && (
          <button
            onClick={() => onRun(() => postsService.requestPublish(post.id), 'Publish proposal created — approve it in Approvals')}
            className="rounded bg-amber-700 px-3 py-1 text-xs hover:bg-amber-600"
          >
            Publish request
          </button>
        )}
        {(post.state === 'approved' || post.state === 'waiting_approval') && post.publishProposalId && (
          <a href="#approvals" className="text-xs text-amber-300 underline">
            awaiting approval → open Approvals
          </a>
        )}
        {post.publishProposalId && ['waiting_approval', 'approved'].includes(post.state) && (
          <button
            onClick={() => setConfirmingId(confirmingId === post.id ? null : post.id)}
            className="rounded bg-rose-900 px-3 py-1 text-xs hover:bg-rose-800"
          >
            Publish confirmation…
          </button>
        )}
        {confirmingId === post.id && (
          <div className="mt-2 w-full rounded border border-rose-800 bg-rose-950/60 p-3 text-sm">
            <p className="font-medium text-rose-200">This post will be published publicly.</p>
            <pre className="my-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-950/80 p-2 text-xs text-slate-300">
              {post.finalText ?? post.text}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  onRun(async () => {
                    await postsService.confirmPublish(post.id)
                    setConfirmingId(null)
                  }, 'Publish confirmed — execute it from the Action Queue')
                }
                className="rounded bg-rose-700 px-4 py-1 text-sm font-semibold text-white hover:bg-rose-600"
              >
                Publish
              </button>
              <button onClick={() => setConfirmingId(null)} className="text-sm text-slate-300 hover:underline">
                Cancel
              </button>
            </div>
          </div>
        )}
        {post.state === 'publish_confirmed' && (
          <a href="#queue" className="text-xs text-emerald-300 underline">
            ready → execute from Action Queue
          </a>
        )}
      </div>
    </article>
  )
}

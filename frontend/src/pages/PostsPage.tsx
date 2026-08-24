import { useCallback, useEffect, useState } from 'react'
import { postsService } from '../services/workflow'
import type { Post } from '../types/posts'
import type { PostState } from '../types/posts'

const input =
  'border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

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
    <div className="space-y-10">
      <header>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ posts</p>
        <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Lifecycle: draft → AI fact review → final draft → approval → publish confirmation →
          published. Nothing is public without explicit confirmation.
        </p>
      </header>

      <hr className="border-[var(--color-border)]" />

      {/* New draft */}
      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ new-draft</p>
        <textarea
          aria-label="post text"
          rows={3}
          placeholder="Write your post — only facts you can verify. Metrics without a source will be flagged."
          className={`${input} mt-4 w-full`}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <button
          onClick={() => run(async () => {
            await postsService.create({ text: newText })
            setNewText('')
          }, 'Draft created')}
          disabled={!newText.trim()}
          className="mt-2 border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Create draft
        </button>
      </section>

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      {/* Posts list */}
      <section>
        <p className="mb-1 text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>$ list ({posts.length})</p>
        <div className="mt-4 space-y-4">
          {posts.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No posts yet.</p>}
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
      </section>
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
  published: 'text-green-600',
  unverified: 'text-yellow-600',
  blocked_fact_check: 'text-red-600',
  waiting_approval: 'text-amber-600',
  publish_confirmed: 'text-amber-600',
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
    <article className="border border-[var(--color-border)] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`uppercase tracking-wider ${STATE_TONE[post.state] ?? 'text-[var(--color-text-secondary)]'}`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {post.state}
        </span>
        <span className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>v{post.versionTag}</span>
        {fv && (
          <span className={fv.isReady ? 'text-green-600' : 'text-amber-600'}>
            fact check: {fv.supportedCount}✓ {fv.unsupportedCount}✗ {fv.needsConfirmationCount}?
          </span>
        )}
        {post.verificationResult && (
          <span className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>result: {post.verificationResult}</span>
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
              className="border border-green-600 bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
            >
              Save edit
            </button>
            <button onClick={() => setEditingId(null)} className="text-sm text-[var(--color-text-muted)] hover:underline">
              cancel
            </button>
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{post.text}</p>
      )}

      {fv?.claims?.some((c) => c.status !== 'supported') && (
        <ul className="mt-2 space-y-1 border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
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
          className="border border-[var(--color-accent)] px-3 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white"
        >
          Run fact check
        </button>
        {editingId !== post.id && (
          <button
            onClick={() => {
              setEditingId(post.id)
              setEditText(post.text)
            }}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            edit (new version)
          </button>
        )}
        {post.state === 'final_draft' && !post.publishProposalId && (
          <button
            onClick={() => onRun(() => postsService.requestPublish(post.id), 'Publish proposal created — approve it in Approvals')}
            className="border border-amber-600 bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700"
          >
            Publish request
          </button>
        )}
        {(post.state === 'approved' || post.state === 'waiting_approval') && post.publishProposalId && (
          <span className="text-xs text-amber-600">
            awaiting approval → open Approvals
          </span>
        )}
        {post.publishProposalId && ['waiting_approval', 'approved'].includes(post.state) && (
          <button
            onClick={() => setConfirmingId(confirmingId === post.id ? null : post.id)}
            className="border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Publish confirmation…
          </button>
        )}
        {confirmingId === post.id && (
          <div className="mt-2 w-full border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-700">This post will be published publicly.</p>
            <pre className="my-2 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-secondary)]">
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
                className="border border-red-600 bg-red-600 px-4 py-1 text-sm font-semibold text-white hover:bg-red-700"
              >
                Publish
              </button>
              <button onClick={() => setConfirmingId(null)} className="text-sm text-[var(--color-text-secondary)] hover:underline">
                Cancel
              </button>
            </div>
          </div>
        )}
        {post.state === 'publish_confirmed' && (
          <span className="text-xs text-green-600">
            ready → execute from Action Queue
          </span>
        )}
      </div>
    </article>
  )
}

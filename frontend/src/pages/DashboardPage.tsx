import { useEffect, useState } from 'react'
import { approvalsService, actionsService, postsService, proposalsService } from '../services/workflow'
import type { ApprovalRequest, LinkedInAction, Proposal } from '../types/workflow'
import type { Post } from '../types/posts'
import type { Profile } from '../types/profile'
import { profileService } from '../services/profile'
import { StateBadge, RiskBadge } from '../components/badges'

interface Counts {
  profile: Profile | null
  pendingProposals: number
  pendingApprovals: number
  approvedActions: number
  blockedPosts: number
}

export default function DashboardPage({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [counts, setCounts] = useState<Counts>({
    profile: null,
    pendingProposals: 0,
    pendingApprovals: 0,
    approvedActions: 0,
    blockedPosts: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      profileService.get(),
      proposalsService.list(),
      approvalsService.list('pending'),
      actionsService.list(),
      postsService.list(),
    ]).then(([profile, proposals, approvals, actions, posts]) => {
      const next: Counts = {
        profile: null,
        pendingProposals: 0,
        pendingApprovals: 0,
        approvedActions: 0,
        blockedPosts: 0,
      }
      if (profile.status === 'fulfilled') next.profile = profile.value.profile
      if (proposals.status === 'fulfilled') {
        const list = proposals.value.proposals as Proposal[]
        next.pendingProposals = list.filter((p) => p.state === 'waiting_for_approval').length
      }
      if (approvals.status === 'fulfilled') {
        next.pendingApprovals = (approvals.value.approvals as ApprovalRequest[]).length
      }
      if (actions.status === 'fulfilled') {
        const list = actions.value.actions as LinkedInAction[]
        next.approvedActions = list.filter((a) => a.status === 'approved' || a.status === 'paused').length
      }
      if (posts.status === 'fulfilled') {
        const list = posts.value.posts as Post[]
        next.blockedPosts = list.filter((p) => p.state === 'blocked_fact_check').length
      }
      setCounts(next)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-slate-400">Loading…</p>

  const cards: Array<{ label: string; value: string | number; tab?: string; tone: string }> = [
    {
      label: 'Profile completeness',
      value: counts.profile ? `${countFilled(counts.profile)} / 8 sections` : 'not created',
      tone: 'text-slate-100',
    },
    {
      label: 'Proposals awaiting approval',
      value: counts.pendingProposals,
      tab: 'approvals',
      tone: counts.pendingProposals > 0 ? 'text-amber-300' : 'text-slate-100',
    },
    {
      label: 'Pending approval requests',
      value: counts.pendingApprovals,
      tab: 'approvals',
      tone: 'text-slate-100',
    },
    {
      label: 'Actions queued (approved/paused)',
      value: counts.approvedActions,
      tab: 'queue',
      tone: counts.approvedActions > 0 ? 'text-sky-300' : 'text-slate-100',
    },
    {
      label: 'Posts blocked by fact check',
      value: counts.blockedPosts,
      tab: 'posts',
      tone: counts.blockedPosts > 0 ? 'text-rose-300' : 'text-slate-100',
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="text-sm text-slate-500">
          Agent status: <span className="font-mono text-emerald-400">IDLE</span> — nothing executes
          without your explicit approval.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => card.tab && onNavigate(card.tab)}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-slate-600"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className={`mt-1 text-lg font-semibold ${card.tone}`}>{card.value}</div>
          </button>
        ))}
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        <h3 className="mb-2 font-semibold text-slate-200">Pipeline</h3>
        <ol className="list-inside list-decimal space-y-1 font-mono text-xs">
          <li>COMMAND → INTENT → PLAN</li>
          <li>CONTENT GENERATION (verified facts only)</li>
          <li>FACT VALIDATION — unsupported claims block READY</li>
          <li>PROPOSAL → your review &amp; edit (new version)</li>
          <li>EXPLICIT APPROVAL (content-bound hash + expiry)</li>
          <li>ACTION QUEUE → EXECUTION (21-check contract)</li>
          <li>VERIFICATION → audit log</li>
        </ol>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        <StateBadge state="waiting_for_approval" />
        <RiskBadge level="critical" />
        <span>Public actions always require a final publish confirmation.</span>
      </section>
    </div>
  )
}

function countFilled(profile: Profile): number {
  return [
    profile.headline?.trim(),
    profile.about?.trim(),
    profile.experiences?.length ? 'x' : '',
    profile.educations?.length ? 'x' : '',
    profile.projects?.length ? 'x' : '',
    profile.skills?.length ? 'x' : '',
    profile.certifications?.length ? 'x' : '',
    profile.featured?.length ? 'x' : '',
  ].filter(Boolean).length
}

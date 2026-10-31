'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, History, Search } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import {
  OrganizationActivityResponse,
  OrganizationDashboardResponse,
} from '@/types/api';

const pageSize = 20;

export default function OrganizationActivityPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);
  const [data, setData] = useState<OrganizationActivityResponse | null>(null);
  const [dashboard, setDashboard] = useState<OrganizationDashboardResponse | null>(null);
  const [page, setPage] = useState(1);
  const [activityType, setActivityType] = useState('');
  const [actorInput, setActorInput] = useState('');
  const [actor, setActor] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hackathonId, setHackathonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getTenantOrganizationDashboard(organizationId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDashboard(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load activity filters.');
        }
      });
    return () => controller.abort();
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.getTenantOrganizationActivity(
      organizationId,
      {
        page,
        limit: pageSize,
        activity_type: activityType || undefined,
        actor: actor || undefined,
        start_date: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
        end_date: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
        hackathon_id: hackathonId || undefined,
      },
      { signal: controller.signal }
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load organization activity.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, page, activityType, actor, startDate, endDate, hackathonId]);

  const applyActor = (event: FormEvent) => {
    event.preventDefault();
    setActor(actorInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Organization workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">Activity History</h1>
        <p className="mt-1 text-sm text-text-muted">Organization-scoped audit events. Sensitive request metadata and private repository content are not shown.</p>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error"><AlertCircle className="h-4 w-4" />{error}</div>}

      <section className="grid gap-3 rounded-xl border border-surface-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-5">
        <select value={activityType} onChange={(event) => { setActivityType(event.target.value); setPage(1); }} className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary" aria-label="Filter by activity type">
          <option value="">All Activity Types</option>
          <option value="hackathon_created">Hackathon created</option>
          <option value="hackathon_updated">Hackathon updated</option>
          <option value="hackathon_published">Hackathon published</option>
          <option value="hackathon_completed">Hackathon completed</option>
          <option value="hackathon_results_published">Results finalized</option>
          <option value="team_created">Team registered</option>
          <option value="team_member_joined">Team member joined</option>
          <option value="submission_created">Project submitted</option>
          <option value="repository_linked">Repository linked</option>
          <option value="submission_branch_updated">Submission updated</option>
          <option value="evaluation.dispatched">Evaluation dispatched</option>
          <option value="evaluation.reevaluated">Evaluation rerun</option>
          <option value="judge_review_submitted">Evaluation completed</option>
          <option value="org_profile_updated">Organization profile updated</option>
          <option value="org_settings_updated">Organization settings updated</option>
        </select>
        <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary" aria-label="From date" />
        <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary" aria-label="To date" />
        <select value={hackathonId} onChange={(event) => { setHackathonId(event.target.value); setPage(1); }} className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary" aria-label="Filter by hackathon">
          <option value="">All Hackathons</option>
          {dashboard?.hackathons.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>
        <form onSubmit={applyActor} className="flex min-w-0">
          <input value={actorInput} onChange={(event) => setActorInput(event.target.value)} placeholder="Actor email" className="min-w-0 flex-1 rounded-l-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary" aria-label="Filter by actor" />
          <button type="submit" className="rounded-r-lg bg-primary px-3 text-white" aria-label="Search actor"><Search className="h-4 w-4" /></button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-surface-border bg-surface">
        {loading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded bg-surface-elevated" />)}</div>
        ) : !data?.total ? (
          <div className="p-12 text-center">
            <History className="mx-auto h-8 w-8 text-text-muted/50" />
            <p className="mt-3 font-semibold text-text-primary">{activityType || actor || startDate || endDate || hackathonId ? 'No activity matches these filters.' : 'No recent organization activity.'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-surface-elevated/60 text-[10px] uppercase tracking-wider text-text-muted"><tr><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Related Entity</th><th className="px-4 py-3">Hackathon</th><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Description</th></tr></thead>
                <tbody className="divide-y divide-surface-border">
                  {data.items.map((item) => (
                    <tr key={item.id} className="text-text-secondary">
                      <td className="px-4 py-3"><span className="block text-text-primary">{item.actor}</span><span className="text-[10px] text-text-muted">{item.actor_role}</span></td>
                      <td className="px-4 py-3">{item.action.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-3"><span className="capitalize">{item.related_entity.replaceAll('_', ' ')}</span><span className="mt-0.5 block max-w-36 truncate font-mono text-[10px] text-text-muted">{item.related_entity_id}</span></td>
                      <td className="px-4 py-3">{item.hackathon_name || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3">{new Date(item.timestamp).toLocaleString()}</td>
                      <td className="max-w-xs px-4 py-3">{item.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-xs text-text-muted">
              <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total} activities</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-surface-border p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                <span>Page {page} of {Math.max(data.total_pages, 1)}</span>
                <button disabled={page >= data.total_pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-surface-border p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BarChart3, RefreshCw } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import { OrganizationDashboardResponse } from '@/types/api';

export default function OrganizationAnalyticsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);
  const [data, setData] = useState<OrganizationDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.getTenantOrganizationDashboard(organizationId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load organization analytics.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId]);

  const metrics = data ? [
    { group: 'Hackathons', values: [['Total Hackathons', data.total_hackathons], ['Active Hackathons', data.active_hackathons], ['Upcoming Hackathons', data.upcoming_hackathons], ['Completed Hackathons', data.completed_hackathons]] },
    { group: 'Teams', values: [['Registered Teams', data.total_teams], ['Teams with Submissions', data.teams_with_submissions], ['Teams Without Submissions', Math.max(data.total_teams - data.teams_with_submissions, 0)]] },
    { group: 'Submissions', values: [['Total Submissions', data.total_submissions], ['Pending Submissions', data.pending_submissions], ['Submitted Projects', data.total_submissions]] },
    { group: 'Evaluations', values: [['Evaluations Completed', data.evaluations_completed], ['Evaluations Pending', data.evaluations_pending], ['Evaluations In Progress', data.evaluations_in_progress], ['Finalized Results', data.finalized_results]] },
  ] : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Organization workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">Analytics</h1>
        <p className="mt-1 text-sm text-text-muted">Record-based summaries across the organization. No modeled or estimated values.</p>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error"><AlertCircle className="h-4 w-4" />{error}</div>}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-xl border border-surface-border bg-surface" />)}
        </div>
      ) : !data || data.total_hackathons + data.total_teams + data.total_submissions === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface p-12 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-text-muted/50" />
          <p className="mt-3 font-semibold text-text-primary">Not enough data available</p>
          <p className="mt-1 text-sm text-text-muted">Analytics appear as organization records are created.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {metrics.map((section) => (
              <section key={section.group} className="rounded-xl border border-surface-border bg-surface p-5">
                <h2 className="font-semibold text-text-primary">{section.group} Statistics</h2>
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  {section.values.map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-surface-border bg-surface-elevated/50 p-3">
                      <dt className="text-xs text-text-muted">{label}</dt>
                      <dd className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-surface-border bg-surface">
            <div className="border-b border-surface-border px-5 py-4">
              <h2 className="font-semibold text-text-primary">Hackathon Performance</h2>
              <p className="mt-1 text-xs text-text-muted">Counts are derived from teams, submissions, and evaluation job records.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="bg-surface-elevated/60 text-[10px] uppercase tracking-wider text-text-muted">
                  <tr><th className="px-4 py-3">Hackathon</th><th className="px-4 py-3">Teams</th><th className="px-4 py-3">Submissions</th><th className="px-4 py-3">Evaluations Completed</th><th className="px-4 py-3">Evaluations Pending</th><th className="px-4 py-3">Results</th></tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {data.hackathons.map((event) => (
                    <tr key={event.id} className="text-text-secondary">
                      <td className="px-4 py-3"><Link className="font-medium text-primary hover:underline" href={`/organizations/${organizationId}/hackathons/${event.id}`}>{event.title}</Link></td>
                      <td className="px-4 py-3">{event.team_count}</td>
                      <td className="px-4 py-3">{event.submission_count}</td>
                      <td className="px-4 py-3">{event.evaluation_completed}</td>
                      <td className="px-4 py-3">{event.evaluation_pending + event.evaluation_in_progress}</td>
                      <td className="px-4 py-3">{event.results_finalized ? 'Finalized' : 'Not finalized'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {!loading && error && <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><RefreshCw className="h-4 w-4" />Retry</button>}
    </div>
  );
}

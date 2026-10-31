'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Edit3,
  FolderKanban,
  Plus,
  RefreshCw,
  Save,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ApiClientError, api } from '@/lib/api-client';
import {
  OrganizationActivityItem,
  OrganizationDashboardResponse,
} from '@/types/api';

export default function OrganizationOverviewPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);
  const [dashboard, setDashboard] = useState<OrganizationDashboardResponse | null>(null);
  const [activities, setActivities] = useState<OrganizationActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTenantOrganizationDashboard(organizationId, {
        signal,
      });
      if (!signal?.aborted) {
        setDashboard(result);
        setNewName(result.name);
      }
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to load organization overview.'
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }

    try {
      const recentActivity = await api.getTenantOrganizationActivity(
        organizationId,
        { page: 1, limit: 5 },
        { signal }
      );
      if (!signal?.aborted) {
        setActivities(recentActivity.items);
        setActivityError(null);
      }
    } catch (err: unknown) {
      if (signal?.aborted || (err instanceof ApiClientError && err.code === 'REQUEST_ABORTED')) return;
      setActivityError(
        err instanceof ApiClientError ? err.message : 'Unable to load recent activity.'
      );
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || name === dashboard?.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateTenantOrganizationProfile(organizationId, { name });
      setSuccess('Organization name updated.');
      setEditingName(false);
      const refreshed = await api.getTenantOrganizationDashboard(organizationId);
      setDashboard(refreshed);
      setNewName(refreshed.name);
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError ? err.message : 'Unable to update organization name.'
      );
    } finally {
      setSaving(false);
    }
  };

  const cards = dashboard
    ? [
        { label: 'Total Hackathons', value: dashboard.total_hackathons, icon: Trophy },
        { label: 'Active Hackathons', value: dashboard.active_hackathons, icon: Activity },
        { label: 'Total Teams', value: dashboard.total_teams, icon: Users },
        { label: 'Total Submissions', value: dashboard.total_submissions, icon: FolderKanban },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Organization workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">Overview</h1>
          <p className="mt-1 text-sm text-text-muted">
            Organization-wide visibility into hackathons, teams, submissions, and judging.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/organizations/${organizationId}/teams`}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            <Users className="h-4 w-4" />
            Manage Teams
          </Link>
          <Link
            href={`/organizations/${organizationId}/hackathons/new`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Create Hackathon
          </Link>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-status-success/30 bg-status-success/10 p-3 text-sm text-status-success">
          <CheckCircle2 className="h-4 w-4" />
          {success}
          <button className="ml-auto" onClick={() => setSuccess(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
          <button onClick={() => void loadDashboard()} className="font-medium underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border border-surface-border bg-surface" />
          ))}
        </div>
      ) : dashboard ? (
        <>
          <section className="rounded-2xl border border-surface-border bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Building2 className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {editingName ? (
                      <form onSubmit={handleRename} className="flex gap-2">
                        <input
                          value={newName}
                          onChange={(event) => setNewName(event.target.value)}
                          maxLength={150}
                          required
                          className="min-w-0 rounded-lg border border-surface-border bg-surface-elevated px-3 py-1.5 text-lg font-bold text-text-primary outline-none focus:border-primary"
                          aria-label="Organization name"
                        />
                        <button disabled={saving} className="rounded-lg bg-primary p-2 text-white disabled:opacity-50" title="Save name">
                          <Save className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { setEditingName(false); setNewName(dashboard.name); }} className="rounded-lg border border-surface-border p-2 text-text-muted" title="Cancel rename">
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      <h2 className="truncate text-xl font-bold text-text-primary">{dashboard.name}</h2>
                    )}
                    <StatusBadge status={dashboard.status} size="sm" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                    <span className="font-mono">ID: {dashboard.id}</span>
                    <span>Created {new Date(dashboard.created_at).toLocaleDateString()}</span>
                    <span>Your role: {dashboard.current_user_role.replaceAll('_', ' ')}</span>
                    <span>Owner: {dashboard.owner_name || dashboard.owner_email || 'Not available'}</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {(dashboard.current_user_role === 'org_owner' || dashboard.current_user_role === 'org_admin') && !editingName && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-text-primary hover:bg-surface-hover"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Rename Organization
                  </button>
                )}
                <Link
                  href={`/organizations/${organizationId}/hackathons`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  Go to Hackathons
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Organization metrics">
            {cards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-surface-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">{label}</span>
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-4 text-3xl font-bold tabular-nums text-text-primary">{value}</p>
                <p className="mt-1 text-xs text-text-muted">From organization records</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
            <div className="overflow-hidden rounded-xl border border-surface-border bg-surface">
              <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
                <div>
                  <h3 className="font-semibold text-text-primary">Recent Hackathons</h3>
                  <p className="mt-0.5 text-xs text-text-muted">Latest events in this organization</p>
                </div>
                <Link href={`/organizations/${organizationId}/hackathons`} className="text-xs font-semibold text-primary hover:underline">View all</Link>
              </div>
              {dashboard.hackathons.length === 0 ? (
                <div className="p-8 text-center text-sm text-text-muted">No hackathons have been created for this organization yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-surface-elevated/60 text-[10px] uppercase tracking-wider text-text-muted">
                      <tr>
                        <th className="px-4 py-3">Hackathon</th><th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Dates</th><th className="px-4 py-3">Teams / Submissions</th>
                        <th className="px-4 py-3">Evaluation Progress</th><th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {dashboard.hackathons.slice(0, 6).map((event) => (
                        <tr key={event.id} className="text-text-secondary">
                          <td className="px-4 py-3 font-medium text-text-primary">{event.title}</td>
                          <td className="px-4 py-3"><StatusBadge status={event.status} size="sm" /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-text-muted">{new Date(event.start_date).toLocaleDateString()} – {new Date(event.end_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3">{event.team_count} / {event.submission_count}</td>
                          <td className="px-4 py-3">
                            {event.evaluation_total === 0 ? 'No evaluations' : `${event.evaluation_completed} / ${event.evaluation_total}`}
                            {event.evaluation_total > 0 && <span className="ml-1 text-text-muted">({Math.round((event.evaluation_completed / event.evaluation_total) * 100)}%)</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/organizations/${organizationId}/hackathons/${event.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                              Open <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-surface-border bg-surface">
              <div className="border-b border-surface-border px-5 py-4">
                <h3 className="font-semibold text-text-primary">Recent Activity</h3>
                <p className="mt-0.5 text-xs text-text-muted">Latest recorded organization events</p>
              </div>
              {activityError ? (
                <p className="p-5 text-sm text-status-error">{activityError}</p>
              ) : activities.length === 0 ? (
                <p className="p-6 text-center text-sm text-text-muted">No recent organization activity.</p>
              ) : (
                <ul className="divide-y divide-surface-border">
                  {activities.map((item) => (
                    <li key={item.id} className="flex gap-3 px-5 py-4">
                      <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><Clock3 className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{item.description || item.action.replaceAll('_', ' ')}</p>
                        <p className="mt-1 truncate text-xs text-text-muted">{item.actor} · {new Date(item.timestamp).toLocaleString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/organizations/${organizationId}/activity`} className="flex items-center justify-between border-t border-surface-border px-5 py-3 text-xs font-semibold text-primary hover:bg-surface-elevated">
                View activity history <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface p-10 text-center text-sm text-text-muted">
          <RefreshCw className="mx-auto mb-3 h-5 w-5" />
          Organization overview is unavailable.
        </div>
      )}
    </div>
  );
}

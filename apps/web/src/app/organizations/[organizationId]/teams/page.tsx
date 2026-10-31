'use client';

import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Users,
  X,
} from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import {
  OrganizationDashboardResponse,
  OrganizationTeamDetailResponse,
  OrganizationTeamListItem,
  OrganizationTeamPage,
} from '@/types/api';

const pageSize = 15;

export default function OrganizationTeamsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);
  const [dashboard, setDashboard] = useState<OrganizationDashboardResponse | null>(null);
  const [data, setData] = useState<OrganizationTeamPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [hackathonId, setHackathonId] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [evaluationStatus, setEvaluationStatus] = useState('');
  const [sortBy, setSortBy] = useState('registered_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<OrganizationTeamDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTeams = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const teamPage = await api.getTenantOrganizationTeams(
          organizationId,
          {
            page,
            limit: pageSize,
            search: submittedSearch || undefined,
            hackathon_id: hackathonId || undefined,
            submission_status: submissionStatus || undefined,
            evaluation_status: evaluationStatus || undefined,
            sort_by: sortBy,
            sort_order: sortOrder,
          },
          { signal }
        );
      if (!signal?.aborted) {
        setData(teamPage);
      }
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to load organization teams.'
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [
    organizationId,
    page,
    submittedSearch,
    hackathonId,
    submissionStatus,
    evaluationStatus,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTeams(controller.signal);
    return () => controller.abort();
  }, [loadTeams]);

  useEffect(() => {
    const controller = new AbortController();
    api.getTenantOrganizationDashboard(organizationId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDashboard(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load hackathon filters.'
          );
        }
      });
    return () => controller.abort();
  }, [organizationId]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  const openTeam = async (team: OrganizationTeamListItem) => {
    setSelectedTeam(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const detail = await api.getTenantOrganizationTeam(organizationId, team.id);
      setSelectedTeam(detail);
    } catch (err: unknown) {
      setDetailError(
        err instanceof ApiClientError ? err.message : 'Unable to load team details.'
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Organization workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">Teams</h1>
        <p className="mt-1 text-sm text-text-muted">Teams registered across this organization&apos;s hackathons.</p>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
          <button onClick={() => void loadTeams()} className="font-semibold underline">Retry</button>
        </div>
      )}

      <section className="rounded-xl border border-surface-border bg-surface p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,auto))]">
          <form onSubmit={submitSearch} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search team name or number"
              className="w-full rounded-lg border border-surface-border bg-surface-elevated py-2 pl-9 pr-20 text-sm text-text-primary outline-none focus:border-primary"
              aria-label="Search teams"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white">Search</button>
          </form>
          <select
            value={hackathonId}
            onChange={(event) => { setHackathonId(event.target.value); setPage(1); }}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            aria-label="Filter by hackathon"
          >
            <option value="">All Hackathons</option>
            {dashboard?.hackathons.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
          <select
            value={submissionStatus}
            onChange={(event) => { setSubmissionStatus(event.target.value); setPage(1); }}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            aria-label="Filter by submission status"
          >
            <option value="">All Submission Statuses</option>
            <option value="submitted">Has Submission</option>
            <option value="no_submission">No Submission</option>
            <option value="pending">Pending</option>
            <option value="evaluated">Evaluated</option>
            <option value="flagged">Flagged</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          <select
            value={evaluationStatus}
            onChange={(event) => { setEvaluationStatus(event.target.value); setPage(1); }}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            aria-label="Filter by evaluation status"
          >
            <option value="">All Evaluation Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="failed">Failed</option>
            <option value="not_started">Not Started</option>
          </select>
        </div>
        <div className="mt-3 flex justify-end">
          {submittedSearch && (
            <button onClick={() => { setSearch(''); setSubmittedSearch(''); setPage(1); }} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
              Clear search <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-surface-border bg-surface">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded bg-surface-elevated" />)}
          </div>
        ) : !data?.total ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-8 w-8 text-text-muted/50" />
            <h2 className="mt-3 font-semibold text-text-primary">No teams found</h2>
            <p className="mt-1 text-sm text-text-muted">
              {submittedSearch || hackathonId || submissionStatus || evaluationStatus
                ? 'No teams match the current search and filters.'
                : "No teams have registered for this organization's hackathons yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="bg-surface-elevated/60 text-[10px] uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-4 py-3"><button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1">Team <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="px-4 py-3">Team Number / ID</th>
                    <th className="px-4 py-3"><button onClick={() => toggleSort('hackathon')} className="inline-flex items-center gap-1">Hackathon <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="px-4 py-3">Team Leader</th>
                    <th className="px-4 py-3"><button onClick={() => toggleSort('member_count')} className="inline-flex items-center gap-1">Members <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="px-4 py-3"><button onClick={() => toggleSort('registered_at')} className="inline-flex items-center gap-1">Registered <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="px-4 py-3">Submission</th>
                    <th className="px-4 py-3">Evaluation</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {data.items.map((team) => (
                    <tr key={team.id} className="text-text-secondary hover:bg-surface-hover/40">
                      <td className="px-4 py-3 font-semibold text-text-primary">{team.name}</td>
                      <td className="px-4 py-3 font-mono text-[10px]">{team.team_number}</td>
                      <td className="px-4 py-3">
                        <Link className="text-primary hover:underline" href={`/organizations/${organizationId}/hackathons/${team.hackathon_id}`}>{team.hackathon_name}</Link>
                      </td>
                      <td className="px-4 py-3">{team.leader_name || team.leader_email || 'Not available'}</td>
                      <td className="px-4 py-3">{team.member_count}</td>
                      <td className="whitespace-nowrap px-4 py-3">{new Date(team.registered_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 capitalize">{team.submission_status.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-3 capitalize">{team.evaluation_status.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => void openTeam(team)} className="font-semibold text-primary hover:underline">View Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-xs text-text-muted">
              <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total} teams</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-surface-border p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                <span>Page {page} of {Math.max(data.total_pages, 1)}</span>
                <button disabled={page >= data.total_pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-surface-border p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </section>

      {(detailLoading || detailError || selectedTeam) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Team details">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-surface-border bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-text-primary">{selectedTeam?.name || 'Team Details'}</h2>
                {selectedTeam && <p className="mt-1 font-mono text-xs text-text-muted">{selectedTeam.team_number}</p>}
              </div>
              <button onClick={() => { setSelectedTeam(null); setDetailError(null); }} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated" aria-label="Close team details"><X className="h-5 w-5" /></button>
            </div>
            {detailLoading ? <p className="py-10 text-center text-sm text-text-muted">Loading team details…</p> : detailError ? <p className="py-8 text-sm text-status-error">{detailError}</p> : selectedTeam && (
              <div className="mt-5 space-y-5">
                <section className="grid gap-4 sm:grid-cols-2">
                  <div><p className="text-xs text-text-muted">Hackathon</p><Link className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={`/organizations/${organizationId}/hackathons/${selectedTeam.hackathon_id}`}>{selectedTeam.hackathon_name}<ExternalLink className="h-3 w-3" /></Link></div>
                  <div><p className="text-xs text-text-muted">Registration Date</p><p className="mt-1 text-sm text-text-primary">{new Date(selectedTeam.created_at).toLocaleString()}</p></div>
                  <div><p className="text-xs text-text-muted">Submission Status</p><p className="mt-1 text-sm capitalize text-text-primary">{selectedTeam.submission_status.replaceAll('_', ' ')}</p></div>
                  <div><p className="text-xs text-text-muted">Evaluation Status</p><p className="mt-1 text-sm capitalize text-text-primary">{selectedTeam.evaluation_status.replaceAll('_', ' ')}</p></div>
                </section>
                <section className="rounded-xl border border-surface-border bg-surface-elevated/50 p-4">
                  <h3 className="text-sm font-semibold text-text-primary">Team Members</h3>
                  {selectedTeam.members.length ? <ul className="mt-3 divide-y divide-surface-border">{selectedTeam.members.map((member) => <li key={member.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-text-primary">{member.name}<span className="ml-2 text-xs capitalize text-text-muted">{member.role}</span></span><span className="text-xs text-text-muted">{member.email}</span></li>)}</ul> : <p className="mt-2 text-sm text-text-muted">No member records available.</p>}
                </section>
                <section className="rounded-xl border border-surface-border bg-surface-elevated/50 p-4">
                  <h3 className="text-sm font-semibold text-text-primary">Project Submission</h3>
                  {selectedTeam.submission_id ? (
                    <div className="mt-3 space-y-2 text-sm">
                      {selectedTeam.submission_title && <p className="font-medium text-text-primary">{selectedTeam.submission_title}</p>}
                      {selectedTeam.submission_description && <p className="whitespace-pre-wrap text-text-secondary">{selectedTeam.submission_description}</p>}
                      {selectedTeam.repository_url && <a className="break-all text-primary hover:underline" href={selectedTeam.repository_url} target="_blank" rel="noreferrer">{selectedTeam.repository_url}</a>}
                    </div>
                  ) : <p className="mt-2 text-sm text-text-muted">No project submission has been recorded.</p>}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { api, ApiClientError } from '@/lib/api-client';
import { OrganizationDashboardResponse } from '@/types/api';

export default function OrganizationProfilePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);
  const [organization, setOrganization] = useState<OrganizationDashboardResponse | null>(null);
  const [name, setName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTenantOrganizationDashboard(organizationId, { signal });
      if (!signal?.aborted) {
        setOrganization(result);
        setName(result.name);
      }
    } catch (err: unknown) {
      if (!signal?.aborted) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to load organization profile.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, [loadProfile]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === organization?.name) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.updateTenantOrganizationProfile(organizationId, { name: nextName });
      setSuccess('Organization name updated.');
      setIsEditing(false);
      await loadProfile();
    } catch (err: unknown) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update organization profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4 animate-pulse"><div className="h-7 w-48 rounded bg-surface-elevated" /><div className="h-56 rounded-2xl border border-surface-border bg-surface" /></div>;
  }
  if (!organization) {
    return <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-6 text-sm text-status-error"><AlertCircle className="mb-2 h-5 w-5" />{error || 'Organization profile is unavailable.'}</div>;
  }

  const canEdit = organization.current_user_role === 'org_owner' || organization.current_user_role === 'org_admin';
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Organization workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">Organization Profile</h1>
        <p className="mt-1 text-sm text-text-muted">Organization identity, ownership, and lifecycle information.</p>
      </header>

      {success && <div className="flex items-center gap-2 rounded-xl border border-status-success/30 bg-status-success/10 p-3 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" />{success}</div>}
      {error && <div className="flex items-center gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error"><AlertCircle className="h-4 w-4" />{error}</div>}

      <section className="rounded-2xl border border-surface-border bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Building2 className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              {isEditing ? (
                <form onSubmit={saveName} className="flex min-w-0 flex-1 gap-2">
                  <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={150} className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-lg font-bold text-text-primary outline-none focus:border-primary" aria-label="Organization name" />
                  <button disabled={saving} className="rounded-lg bg-primary p-2 text-white disabled:opacity-50" title="Save organization name"><Save className="h-4 w-4" /></button>
                  <button type="button" onClick={() => { setIsEditing(false); setName(organization.name); }} className="rounded-lg border border-surface-border p-2 text-text-muted" title="Cancel"><X className="h-4 w-4" /></button>
                </form>
              ) : (
                <h2 className="text-xl font-bold text-text-primary">{organization.name}</h2>
              )}
              <StatusBadge status={organization.status} size="sm" />
              {canEdit && !isEditing && <button onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-hover"><Edit3 className="h-3.5 w-3.5" />Rename</button>}
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              <div><dt className="text-xs text-text-muted">Organization ID</dt><dd className="mt-1 break-all font-mono text-xs text-text-primary">{organization.id}</dd></div>
              <div><dt className="text-xs text-text-muted">Organization Slug</dt><dd className="mt-1 font-mono text-sm text-text-primary">{organization.slug}</dd></div>
              <div><dt className="text-xs text-text-muted">Organization Owner</dt><dd className="mt-1 text-sm text-text-primary">{organization.owner_name || 'Name not available'}{organization.owner_email && <span className="mt-0.5 block text-xs text-text-muted">{organization.owner_email}</span>}</dd></div>
              <div><dt className="text-xs text-text-muted">Your Organization Role</dt><dd className="mt-1 capitalize text-sm text-text-primary">{organization.current_user_role.replaceAll('_', ' ')}</dd></div>
              <div><dt className="text-xs text-text-muted">Creation Date</dt><dd className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-primary"><CalendarDays className="h-3.5 w-3.5 text-text-muted" />{new Date(organization.created_at).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-text-muted">Organization Status</dt><dd className="mt-1 inline-flex items-center gap-1.5 text-sm capitalize text-text-primary"><ShieldCheck className="h-3.5 w-3.5 text-text-muted" />{organization.status}</dd></div>
            </dl>
          </div>
        </div>
        <div className="mt-6 border-t border-surface-border pt-4 text-xs text-text-muted">
          Description and custom logo are not currently supported by the organization data model.
        </div>
      </section>
    </div>
  );
}

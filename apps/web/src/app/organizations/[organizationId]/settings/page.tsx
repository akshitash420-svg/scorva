'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Save, Settings2, X } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import { OrganizationDashboardResponse } from '@/types/api';

export default function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = use(params);
  const [organization, setOrganization] = useState<OrganizationDashboardResponse | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [maxHackathons, setMaxHackathons] = useState('10');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.getTenantOrganizationDashboard(organizationId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setOrganization(result);
        setTimezone(String(result.settings.timezone ?? 'UTC'));
        setMaxHackathons(String(result.settings.max_hackathons ?? 10));
        setDirty(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof ApiClientError ? err.message : 'Unable to load organization settings.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId]);

  const reset = () => {
    setTimezone(String(organization?.settings.timezone ?? 'UTC'));
    setMaxHackathons(String(organization?.settings.max_hackathons ?? 10));
    setDirty(false);
    setError(null);
    setSuccess(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!organization) return;
    setError(null);
    setSuccess(null);
    const timezoneChanged = timezone !== String(organization.settings.timezone ?? 'UTC');
    const quotaChanged =
      organization.current_user_role === 'org_owner' &&
      maxHackathons !== String(organization.settings.max_hackathons ?? 10);
    if (!timezoneChanged && !quotaChanged) {
      setDirty(false);
      return;
    }

    if (timezoneChanged) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
      } catch {
        setError('Enter a valid IANA timezone, such as UTC or America/New_York.');
        return;
      }
    }
    let quota: number | undefined;
    if (quotaChanged) {
      quota = Number(maxHackathons);
      if (!Number.isInteger(quota) || quota < 1 || quota > 10000) {
        setError('Maximum hackathons must be a whole number from 1 to 10000.');
        return;
      }
    }
    setSaving(true);
    try {
      const updated = await api.updateTenantOrganizationSettings(organizationId, {
        ...(timezoneChanged ? { timezone } : {}),
        ...(quota !== undefined ? { max_hackathons: quota } : {}),
      });
      setOrganization({ ...organization, settings: updated.settings });
      setSuccess('Organization settings saved.');
      setDirty(false);
    } catch (err: unknown) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save organization settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4 animate-pulse"><div className="h-7 w-48 rounded bg-surface-elevated" /><div className="h-60 rounded-2xl border border-surface-border bg-surface" /></div>;
  }
  if (!organization) {
    return <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-6 text-sm text-status-error"><AlertCircle className="mb-2 h-5 w-5" />{error || 'Organization settings are unavailable.'}</div>;
  }

  const canEdit = organization.current_user_role === 'org_owner' || organization.current_user_role === 'org_admin';
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Organization workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Manage supported settings for {organization.name}.</p>
      </header>

      {success && <div className="flex items-center gap-2 rounded-xl border border-status-success/30 bg-status-success/10 p-3 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" />{success}</div>}
      {error && <div className="flex items-center gap-2 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error"><AlertCircle className="h-4 w-4" />{error}</div>}
      {!canEdit && <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">Permission denied: organization owner or administrator access is required to edit settings.</div>}

      <form onSubmit={save} className="max-w-3xl rounded-2xl border border-surface-border bg-surface p-5 sm:p-7">
        <div className="flex items-start gap-3 border-b border-surface-border pb-5">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Settings2 className="h-5 w-5" /></span>
          <div><h2 className="font-semibold text-text-primary">Organization configuration</h2><p className="mt-1 text-xs text-text-muted">Only supported organization-level values are shown. Platform-wide settings are not exposed here.</p></div>
        </div>
        <div className="space-y-5 py-5">
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Timezone</span>
            <span className="mt-1 block text-xs text-text-muted">Use a valid IANA timezone name.</span>
            <input
              value={timezone}
              onChange={(event) => { setTimezone(event.target.value); setDirty(true); }}
              maxLength={100}
              disabled={!canEdit}
              className="mt-2 w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-60"
              placeholder="UTC"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Maximum hackathons</span>
            <span className="mt-1 block text-xs text-text-muted">Current effective limit: {String(organization.settings.max_hackathons ?? 10)} (default when no override is stored).</span>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={maxHackathons}
              onChange={(event) => { setMaxHackathons(event.target.value); setDirty(true); }}
              disabled={organization.current_user_role !== 'org_owner'}
              className="mt-2 w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-60"
            />
            {organization.current_user_role !== 'org_owner' && <span className="mt-1 block text-xs text-text-muted">Only the organization owner may change the quota.</span>}
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border pt-4">
          <button type="button" onClick={reset} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-elevated px-3.5 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"><X className="h-4 w-4" />Cancel</button>
          <button type="submit" disabled={!canEdit || !dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  );
}

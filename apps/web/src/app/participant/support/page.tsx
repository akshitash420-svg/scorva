'use client';

import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  PlusCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  ArrowLeft,
  ShieldCheck,
  User,
  Paperclip,
} from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import {
  SupportTicketItem,
  SupportTicketDetailResponse,
  CreateSupportTicketRequest,
  ParticipantTeamItem,
} from '@/types/api';

const SUPPORT_CATEGORIES = [
  'Project Submission',
  'GitHub / Repository Issue',
  'Team & Member Issue',
  'AI Evaluation / Judging',
  'Results & Leaderboard',
  'Account & Login',
  'Event Related',
  'Venue / Seating Query',
  'Technical Issue',
  'Other',
];
const SUPPORT_BLOCKS = Array.from({ length: 10 }, (_, index) => `Block ${index + 1}`);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'];

export default function ParticipantSupportPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [teams, setTeams] = useState<ParticipantTeamItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [category, setCategory] = useState('Project Submission');
  const [teamName, setTeamName] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [blockNumber, setBlockNumber] = useState('');
  const [labNumber, setLabNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [hackathonId, setHackathonId] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reply state
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const fetchTickets = async () => {
    setIsLoading(true);
    setError(null);
    const [ticketResult, teamResult] = await Promise.allSettled([
      api.getParticipantSupportTickets(),
      api.getParticipantTeams(),
    ]);

    if (ticketResult.status === 'fulfilled') {
      setTickets(ticketResult.value);
    } else {
      console.error('Failed to load participant support requests', ticketResult.reason);
      setTickets([]);
      setError(
        ticketResult.reason instanceof ApiClientError
          ? `Unable to load your requests: ${ticketResult.reason.message}`
          : 'Unable to load your requests. Check your connection and try again.'
      );
    }

    if (teamResult.status === 'fulfilled') {
      setTeams(teamResult.value);
      if (teamResult.value.length > 0) {
        setHackathonId((current) => current || teamResult.value[0].hackathon_id);
      }
    } else {
      console.error('Failed to load participant teams for support requests', teamResult.reason);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    if (!successMessage) return;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const fetchTicketDetail = async (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setIsDetailLoading(true);
    setTicketDetail(null);
    setDetailError(null);
    try {
      const res = await api.getParticipantSupportTicketDetail(ticketId);
      setTicketDetail(res);
    } catch (err: unknown) {
      console.error('Failed to load participant support request details', err);
      setDetailError(
        err instanceof ApiClientError
          ? `Unable to load this request: ${err.message}`
          : 'Unable to load this request. Check your connection and try again.'
      );
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3) {
      setFormError('Subject must be at least 3 characters.');
      return;
    }
    if (description.trim().length < 10) {
      setFormError('Please provide more description (at least 10 characters).');
      return;
    }
    if (!teamName.trim()) {
      setFormError('Team name is required.');
      return;
    }
    if (category === 'Venue / Seating Query' && !teamNumber.trim()) {
      setFormError('Team number is required for Venue / Seating Query.');
      return;
    }
    if (category !== 'Venue / Seating Query' && (!blockNumber || !labNumber.trim())) {
      setFormError('Select a block and enter a lab number.');
      return;
    }
    if (attachment) {
      const extension = attachment.name.slice(attachment.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) {
        setFormError('Attachment must be a PNG, JPG, JPEG, or PDF file.');
        return;
      }
      if (attachment.size > MAX_ATTACHMENT_BYTES) {
        setFormError('Attachment must be 5 MB or smaller.');
        return;
      }
      const expectedMimeTypes: Record<string, string[]> = {
        '.png': ['image/png'],
        '.jpg': ['image/jpeg'],
        '.jpeg': ['image/jpeg'],
        '.pdf': ['application/pdf'],
      };
      if (attachment.type && !expectedMimeTypes[extension].includes(attachment.type)) {
        setFormError('The selected file type does not match its file extension.');
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const request: CreateSupportTicketRequest = {
        category,
        team_name: teamName.trim(),
        subject: subject.trim(),
        description: description.trim(),
        hackathon_id: hackathonId || undefined,
      };
      if (category === 'Venue / Seating Query') {
        request.team_number = teamNumber.trim();
      } else {
        request.block_number = blockNumber;
        request.lab_number = labNumber.trim();
      }
      if (attachment) request.attachment = attachment;

      const newTicket = await api.createParticipantSupportTicket(request);
      setSuccessMessage(
        `Your support request has been submitted successfully! Request ID: ${newTicket.ticket_number}`
      );
      setCategory('Project Submission');
      setTeamName('');
      setTeamNumber('');
      setBlockNumber('');
      setLabNumber('');
      setSubject('');
      setDescription('');
      setAttachment(null);
      await fetchTickets();
      setActiveTab('list');
      await fetchTicketDetail(newTicket.id);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to create ticket. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyMessage.trim()) return;

    setIsSendingReply(true);
    setReplyError(null);
    try {
      const newReply = await api.replyParticipantSupportTicket(selectedTicketId, {
        message: replyMessage.trim(),
      });
      setTicketDetail((prev) =>
        prev ? { ...prev, replies: [...prev.replies, newReply] } : null
      );
      setReplyMessage('');
      // Also update ticket list reply count
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicketId
            ? { ...t, replies_count: t.replies_count + 1, updated_at: new Date().toISOString() }
            : t
        )
      );
    } catch (err: unknown) {
      console.error('Failed to post participant support reply', err);
      setReplyError(
        err instanceof ApiClientError
          ? `Unable to send your reply: ${err.message}`
          : 'Unable to send your reply. Check your connection and try again.'
      );
    } finally {
      setIsSendingReply(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
            Closed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        );
      case 'waiting_response':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
            Awaiting Staff
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
            Open
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
            <LifeBuoy className="w-4 h-4" />
            Participant Help Desk
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827]">
            Support & Help Center
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Need help with your repository, evaluation feedback, team roster, or platform tools? Contact hackathon organizers directly.
          </p>
        </div>

        {/* Tab Switcher */}
        {!selectedTicketId && (
          <div className="flex items-center bg-[#F8FAFC] p-1 rounded-lg border border-[#E2E8F0] shrink-0">
            <button
              onClick={() => {
                setActiveTab('list');
                setSelectedTicketId(null);
              }}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'list'
                  ? 'bg-white text-[#111827] shadow-2xs font-semibold'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              My Requests ({tickets.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('new');
                setSelectedTicketId(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'new'
                  ? 'bg-white text-[#111827] shadow-2xs font-semibold'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              New Request
            </button>
          </div>
        )}
      </div>

      {successMessage && (
        <div role="status" className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-4 py-3 text-xs text-[#166534]">
          {successMessage}
        </div>
      )}

      {/* Main Content Area */}
      {selectedTicketId ? (
        /* Ticket Detail & Conversation View */
        <div className="space-y-6">
          <button
            onClick={() => {
              setSelectedTicketId(null);
              setTicketDetail(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Requests
          </button>

          {isDetailLoading ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-xs">
              <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mb-3" />
              <p className="text-sm font-semibold text-[#111827]">Loading conversation thread...</p>
            </div>
          ) : detailError ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center max-w-lg mx-auto shadow-xs">
              <AlertCircle className="w-10 h-10 text-[#DC2626] mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-[#111827]">Failed to load request</h3>
              <p className="text-xs text-[#64748B] mt-1">{detailError}</p>
              <button
                onClick={() => selectedTicketId && fetchTicketDetail(selectedTicketId)}
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : ticketDetail ? (
            <div className="space-y-6">
              {/* Ticket Overview Card */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E2E8F0] gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                        {ticketDetail.ticket.ticket_number}
                      </span>
                      <span className="text-xs text-[#64748B]">
                        {ticketDetail.ticket.category}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-[#111827]">
                      {ticketDetail.ticket.subject}
                    </h2>
                  </div>
                  <div className="shrink-0">{getStatusBadge(ticketDetail.ticket.status)}</div>
                </div>

                <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#64748B]">
                    <span className="font-semibold text-[#111827]">Initial Description</span>
                    <span>{new Date(ticketDetail.ticket.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-line">
                    {ticketDetail.ticket.description}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#64748B]">
                    <span>Team: {ticketDetail.ticket.team_name}</span>
                    {ticketDetail.ticket.team_number && (
                      <span>Team Number: {ticketDetail.ticket.team_number}</span>
                    )}
                    {ticketDetail.ticket.block_number && (
                      <span>Block: {ticketDetail.ticket.block_number}</span>
                    )}
                    {ticketDetail.ticket.lab_number && (
                      <span>Lab: {ticketDetail.ticket.lab_number}</span>
                    )}
                    {ticketDetail.ticket.attachment_url && (
                      <a
                        href={api.getParticipantSupportTicketAttachmentUrl(ticketDetail.ticket.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                      >
                        <Paperclip className="w-3 h-3" />
                        {ticketDetail.ticket.attachment_name || 'Download attachment'}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Replies Thread */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                  <h3 className="text-sm font-bold text-[#111827]">
                    Conversation Thread ({ticketDetail.replies.length} replies)
                  </h3>
                </div>

                {ticketDetail.replies.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-6 text-center">
                    No replies yet. An organizer or support member will respond shortly.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {ticketDetail.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className={`p-4 rounded-xl border ${
                          reply.is_staff
                            ? 'bg-[#EFF6FF] border-[#BFDBFE] ml-4 sm:ml-8'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] mr-4 sm:mr-8'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {reply.is_staff ? (
                              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold">
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-[#E2E8F0] text-[#475569] flex items-center justify-center text-[10px] font-bold">
                                <User className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <span className="text-xs font-bold text-[#111827]">
                              {reply.author_name}
                            </span>
                            {reply.is_staff && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#2563EB] text-white">
                                Organizer Staff
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#64748B]">
                            {new Date(reply.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-line pl-8">
                          {reply.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Form */}
                <form onSubmit={handleSendReply} className="pt-4 border-t border-[#E2E8F0] space-y-3">
                  {replyError && (
                    <p role="alert" className="text-xs text-[#DC2626]">{replyError}</p>
                  )}
                  <label htmlFor="reply-input" className="block text-xs font-semibold text-[#111827]">
                    Add a follow-up reply
                  </label>
                  <textarea
                    id="reply-input"
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply to the organizer here..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSendingReply || !replyMessage.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingReply ? 'Sending...' : 'Send Reply'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      ) : activeTab === 'new' ? (
        /* Create New Ticket Form */
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 sm:p-8 max-w-2xl mx-auto shadow-xs">
          <h2 className="text-lg font-bold text-[#111827] mb-1">Submit a Support Request</h2>
          <p className="text-xs text-[#64748B] mb-6">
            Describe your inquiry clearly so our team can help you resolve it quickly.
          </p>

          {formError && (
            <div className="mb-5 p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] flex items-center gap-2 text-xs text-[#DC2626]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleCreateTicket} className="w-full min-w-0 space-y-4">
            <div>
              <label htmlFor="req-category" className="block text-xs font-semibold text-[#111827] mb-1">
                Category
              </label>
              <select
                id="req-category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setTeamNumber('');
                  setBlockNumber('');
                  setLabNumber('');
                  setFormError(null);
                }}
                required
                className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg bg-white border border-[#E2E8F0] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                {SUPPORT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            {teams.length > 1 && (
              <div>
                <label htmlFor="req-hackathon" className="block text-xs font-semibold text-[#111827] mb-1">
                  Related Hackathon
                </label>
                <select
                  id="req-hackathon"
                  value={hackathonId}
                  onChange={(e) => setHackathonId(e.target.value)}
                  className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg bg-white border border-[#E2E8F0] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  {teams.map((t) => (
                    <option key={t.hackathon_id} value={t.hackathon_id}>
                      {t.hackathon_title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="req-team-name" className="block text-xs font-semibold text-[#111827] mb-1">
                Team Name
              </label>
              <input
                id="req-team-name"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter your team name"
                maxLength={200}
                required
                className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {category === 'Venue / Seating Query' ? (
              <div>
                <label htmlFor="req-team-number" className="block text-xs font-semibold text-[#111827] mb-1">
                  Team Number
                </label>
                <input
                  id="req-team-number"
                  type="text"
                  value={teamNumber}
                  onChange={(e) => setTeamNumber(e.target.value)}
                  placeholder="Enter your team number"
                  maxLength={100}
                  required
                  className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="req-block-number" className="block text-xs font-semibold text-[#111827] mb-1">
                    Block Number
                  </label>
                  <select
                    id="req-block-number"
                    value={blockNumber}
                    onChange={(e) => setBlockNumber(e.target.value)}
                    required
                    className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg bg-white border border-[#E2E8F0] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="">Select a block</option>
                    {SUPPORT_BLOCKS.map((block) => (
                      <option key={block} value={block}>{block}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="req-lab-number" className="block text-xs font-semibold text-[#111827] mb-1">
                    Lab Number
                  </label>
                  <input
                    id="req-lab-number"
                    type="text"
                    value={labNumber}
                    onChange={(e) => setLabNumber(e.target.value)}
                    placeholder="Enter your lab number"
                    maxLength={100}
                    required
                    className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="req-subject" className="block text-xs font-semibold text-[#111827] mb-1">
                Subject
              </label>
              <input
                id="req-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter a short subject for your issue"
                minLength={3}
                maxLength={200}
                required
                className="box-border h-9 w-full max-w-full min-w-0 px-3 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            <div>
              <label htmlFor="req-description" className="block text-xs font-semibold text-[#111827] mb-1">
                Detailed Description
              </label>
              <textarea
                id="req-description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain your issue in detail. Include any relevant information..."
                minLength={10}
                maxLength={5000}
                required
                className="box-border w-full max-w-full min-w-0 px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            <div className="w-full min-w-0">
              <label htmlFor="req-attachment" className="block text-xs font-semibold text-[#111827] mb-1">
                Attachment (Optional)
              </label>
              <input
                id="req-attachment"
                key={attachment?.name || 'no-attachment'}
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                className="box-border block w-full max-w-full min-w-0 text-xs text-[#64748B] file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[#EFF6FF] file:text-[#2563EB] file:text-xs file:font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#94A3B8]">PNG, JPG, JPEG, or PDF. Maximum size: 5 MB.</p>
              {attachment && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#475569]">
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="shrink-0 font-semibold text-[#2563EB] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="pt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 text-xs font-medium text-[#64748B] hover:text-[#111827] rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Submitting...' : 'Submit Request'}</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Requests List View */
        <div>
          {isLoading ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-xs">
              <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mb-3" />
              <p className="text-sm font-semibold text-[#111827]">Loading your support tickets...</p>
            </div>
          ) : error ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center max-w-lg mx-auto shadow-xs">
              <AlertCircle className="w-10 h-10 text-[#DC2626] mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-[#111827]">Failed to load tickets</h3>
              <p className="text-xs text-[#64748B] mt-1">{error}</p>
              <button
                onClick={fetchTickets}
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center max-w-xl mx-auto shadow-xs space-y-3">
              <LifeBuoy className="w-10 h-10 text-[#94A3B8] mx-auto mb-2" />
              <h3 className="text-base font-bold text-[#111827]">No Requests Yet</h3>
              <p className="text-xs text-[#64748B]">
                You haven't submitted any support requests yet. If you need assistance, create a new request.
              </p>
              <button
                onClick={() => {
                  setActiveTab('new');
                  setSuccessMessage(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 mt-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Create New Request
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => fetchTicketDetail(ticket.id)}
                  className="bg-white border border-[#E2E8F0] hover:border-[#BFDBFE] rounded-xl p-5 shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                        {ticket.ticket_number}
                      </span>
                      <span className="text-xs font-semibold text-[#111827]">{ticket.subject}</span>
                      {getStatusBadge(ticket.status)}
                    </div>
                    <p className="text-xs text-[#64748B] line-clamp-1">{ticket.description}</p>
                    <div className="flex items-center gap-3 text-[11px] text-[#94A3B8] pt-0.5">
                      <span>Category: {ticket.category}</span>
                      <span>• Team: {ticket.team_name}</span>
                      {ticket.hackathon_title && <span>• {ticket.hackathon_title}</span>}
                      <span>• Created {new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                      <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>{ticket.replies_count} {ticket.replies_count === 1 ? 'reply' : 'replies'}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchTicketDetail(ticket.id);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

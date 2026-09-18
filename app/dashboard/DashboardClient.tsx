'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase-client';
import {
  IconAnalytics,
  IconQrCode,
  IconTable,
  IconEvent,
  IconUsers,
  IconShield,
  IconAdmin,
  IconLogout,
  IconCopy,
  IconDownload,
  IconPlus,
  IconUserPlus,
  IconTrash,
} from '@/components/Icons';
import type {
  Role,
  EventRecord,
  FormField,
  TeamRecord,
  UserProfile,
  Submission,
  QRCodeRecord,
  AllowedEmailRecord,
} from '@/types';

interface DashboardClientProps {
  user: {
    uid: string;
    email: string;
    name: string;
    role: Role;
    teamId?: string;
  };
}

export function isSubmissionCreditedToMember(s: Submission, memberUid: string, memberName?: string): boolean {
  if (s.creditedMemberIds && s.creditedMemberIds.length > 0) {
    if (s.creditedMemberIds.includes(memberUid)) return true;
  }
  if (s.memberId === memberUid) return true;
  if (memberName && s.teamMembers && s.teamMembers.length > 0) {
    if (s.teamMembers.some((m) => m.toLowerCase().trim() === memberName.toLowerCase().trim())) return true;
  }
  return false;
}

export default function DashboardClient({ user }: DashboardClientProps) {
  const isSuperAdmin = user.role === 'superadmin';
  const isAdmin = user.role === 'admin' || isSuperAdmin;
  const isMember = user.role === 'member';

  // Navigation state
  const defaultTab = isMember ? 'my-qr' : 'overview';
  const [activeTab, setActiveTab] = useState<
    'overview' | 'events' | 'sheet' | 'teams' | 'roles' | 'my-qr' | 'whitelist'
  >(defaultTab);

  // Core Data
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // My QR Code State
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [myQr, setMyQr] = useState<QRCodeRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadingPass, setDownloadingPass] = useState(false);

  // Sheet Filters
  const [sheetEventFilter, setSheetEventFilter] = useState<string>('all');
  const [sheetSearch, setSheetSearch] = useState<string>('');

  // Event Creation Modal State
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventActive, setNewEventActive] = useState(true);
  const [newEventFields, setNewEventFields] = useState<FormField[]>([
    { id: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'e.g. Aarav Sharma' },
    { id: 'phone', label: 'Phone Number', type: 'phone', required: true, placeholder: '+91 98765 43210' },
    { id: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'aarav@kiit.ac.in' },
    { id: 'rollNo', label: 'Roll Number', type: 'text', required: false, placeholder: 'e.g. 2105490' },
  ]);
  const [savingEvent, setSavingEvent] = useState(false);

  // Team Creation Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // Member Creation Form State
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemName, setNewMemName] = useState('');
  const [newMemEmail, setNewMemEmail] = useState('');
  const [newMemPassword, setNewMemPassword] = useState('');
  const [newMemTeamId, setNewMemTeamId] = useState('');
  const [newMemRole, setNewMemRole] = useState<'member' | 'admin'>('member');
  const [savingMember, setSavingMember] = useState(false);
  const [memberCreateError, setMemberCreateError] = useState('');

  // Role Assignment State (Superadmin)
  const [roleUpdatingUid, setRoleUpdatingUid] = useState<string | null>(null);

  // Existing Member Team Assignment State
  const [updatingMemberTeamId, setUpdatingMemberTeamId] = useState<string | null>(null);

  // Whitelist (Allowed Emails) State
  const [emailsInput, setEmailsInput] = useState('');
  const [savingEmails, setSavingEmails] = useState(false);
  const [whitelistMessage, setWhitelistMessage] = useState('');
  const [whitelistSearch, setWhitelistSearch] = useState('');
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null);

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        fetch('/api/events').then((r) => r.json()),
        fetch('/api/submissions').then((r) => r.json()),
      ];

      if (isAdmin) {
        promises.push(fetch('/api/teams').then((r) => r.json()));
        promises.push(fetch('/api/members').then((r) => r.json()));
        promises.push(fetch('/api/allowed-emails').then((r) => r.json()));
      }

      const results = await Promise.all(promises);
      const evJson = results[0];
      const subJson = results[1];

      if (evJson.events) {
        setEvents(evJson.events);
        if (evJson.events.length > 0 && !selectedEventId) {
          setSelectedEventId(evJson.events[0].id);
        }
      }
      if (subJson.submissions) {
        setSubmissions(subJson.submissions);
      }

      if (isAdmin) {
        const teamJson = results[2];
        const memJson = results[3];
        const allowJson = results[4];

        if (teamJson?.teams) setTeams(teamJson.teams);
        if (memJson?.members) setMembers(memJson.members);
        if (allowJson?.allowedEmails) setAllowedEmails(allowJson.allowedEmails);
      }
    } catch (err) {
      console.error('Failed loading dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedEventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Load Fixed QR Code when selected event changes
  useEffect(() => {
    async function loadQr() {
      if (!selectedEventId) return;
      setQrLoading(true);
      try {
        const res = await fetch(`/api/qr?eventId=${encodeURIComponent(selectedEventId)}`);
        const json = await res.json();
        if (res.ok && json.qr) {
          setMyQr(json.qr);
          const scanUrl = `${window.location.origin}/scan?qr=${json.qr.id}`;
          const QRCode = (await import('qrcode')).default;
          const urlData = await QRCode.toDataURL(scanUrl, {
            width: 380,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          setQrDataUrl(urlData);
        } else {
          setMyQr(null);
          setQrDataUrl('');
        }
      } catch (e) {
        console.error('Failed to generate QR code', e);
      } finally {
        setQrLoading(false);
      }
    }
    loadQr();
  }, [selectedEventId]);

  // Logout handler
  async function handleLogout() {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Firebase signOut error', err);
    }
    await fetch('/api/session', { method: 'DELETE' });
    window.location.href = '/login';
  }

  // Handle Event Creation
  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSavingEvent(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle,
          description: newEventDesc,
          active: newEventActive,
          formFields: newEventFields,
        }),
      });
      if (res.ok) {
        setShowEventModal(false);
        setNewEventTitle('');
        setNewEventDesc('');
        setRefreshKey((k) => k + 1);
      } else {
        const j = await res.json();
        alert(j.error || 'Failed to create event');
      }
    } catch {
      alert('Network error while creating event');
    } finally {
      setSavingEvent(false);
    }
  }

  function addFormField() {
    const id = `field_${Date.now()}`;
    setNewEventFields((prev) => [
      ...prev,
      { id, label: 'Custom Field', type: 'text', required: false, placeholder: '' },
    ]);
  }

  function removeFormField(index: number) {
    setNewEventFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFormField(index: number, key: keyof FormField, val: any) {
    setNewEventFields((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: val };
      return copy;
    });
  }

  // Handle Team Creation
  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setSavingTeam(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName, description: newTeamDesc }),
      });
      if (res.ok) {
        setNewTeamName('');
        setNewTeamDesc('');
        setRefreshKey((k) => k + 1);
      } else {
        const j = await res.json();
        alert(j.error || 'Failed to create team');
      }
    } catch {
      alert('Network error while creating team');
    } finally {
      setSavingTeam(false);
    }
  }

  // Admin: Disband / Delete a team with timestamp & past lead preservation
  async function handleDeleteTeam(teamId: string, teamName: string) {
    const ok = confirm(
      `Disband and delete team "${teamName}"?\n\n` +
      `• Historical Integrity: All past registrations and leads will permanently retain "${teamName}" and member attribution.\n` +
      `• Effective From Today: Current members of this squad will become Unassigned.\n` +
      `• Future registrations from today onward will not be credited to this deleted squad.`
    );
    if (!ok) return;

    setDeletingTeamId(teamId);
    try {
      const res = await fetch(`/api/teams?id=${encodeURIComponent(teamId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setTeams((prev) => prev.filter((t) => t.id !== teamId));
        setMembers((prev) =>
          prev.map((m) =>
            m.teamId === teamId
              ? { ...m, teamId: undefined, teamName: 'Unassigned' }
              : m
          )
        );
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'Failed to delete team');
      }
    } catch {
      alert('Network error while deleting team');
    } finally {
      setDeletingTeamId(null);
    }
  }

  // Handle Member Creation
  async function handleCreateMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberCreateError('');
    setSavingMember(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMemName,
          email: newMemEmail,
          password: newMemPassword,
          teamId: newMemTeamId,
          role: newMemRole,
        }),
      });
      if (res.ok) {
        setShowMemberModal(false);
        setNewMemName('');
        setNewMemEmail('');
        setNewMemPassword('');
        setRefreshKey((k) => k + 1);
      } else {
        const j = await res.json();
        setMemberCreateError(j.error || 'Failed to create member');
      }
    } catch {
      setMemberCreateError('Network error');
    } finally {
      setSavingMember(false);
    }
  }

  // Admin: Assign or change existing member's team
  async function handleAssignMemberTeam(memberId: string, teamId: string) {
    setUpdatingMemberTeamId(memberId);
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, teamId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.uid === memberId
              ? {
                  ...m,
                  teamId: data.teamId || undefined,
                  teamName: data.teamName || 'Unassigned',
                }
              : m
          )
        );
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'Failed to update team assignment');
      }
    } catch {
      alert('Network error while assigning team');
    } finally {
      setUpdatingMemberTeamId(null);
    }
  }

  // Superadmin: Update User Role
  async function handleUpdateRole(targetUid: string, role: Role) {
    setRoleUpdatingUid(targetUid);
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid, role }),
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      } else {
        const j = await res.json();
        alert(j.error || 'Role update failed');
      }
    } catch {
      alert('Network error while updating role');
    } finally {
      setRoleUpdatingUid(null);
    }
  }

  // Toggle Event Active State
  async function handleToggleEventActive(eventId: string, currentStatus: boolean) {
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentStatus }),
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Whitelist: Add Multiple Emails
  async function handleAddAllowedEmails(e: React.FormEvent) {
    e.preventDefault();
    if (!emailsInput.trim()) return;
    setSavingEmails(true);
    setWhitelistMessage('');
    try {
      const res = await fetch('/api/allowed-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: emailsInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setWhitelistMessage(
          `Successfully authorized ${data.addedCount} email(s). ${data.duplicateCount > 0 ? `(${data.duplicateCount} duplicates skipped)` : ''
          }`
        );
        setEmailsInput('');
        setRefreshKey((k) => k + 1);
      } else {
        setWhitelistMessage(data.error || 'Failed to authorize emails');
      }
    } catch {
      setWhitelistMessage('Network error while authorizing emails');
    } finally {
      setSavingEmails(false);
    }
  }

  // Whitelist: Remove an email
  async function handleRemoveAllowedEmail(id: string, email: string) {
    if (!confirm(`Remove ${email} from authorized whitelist?`)) return;
    setDeletingEmailId(id);
    try {
      const res = await fetch(`/api/allowed-emails?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      } else {
        const j = await res.json();
        alert(j.error || 'Failed to remove email');
      }
    } catch {
      alert('Network error');
    } finally {
      setDeletingEmailId(null);
    }
  }

  // Filtered Whitelist
  const filteredAllowedEmails = useMemo(() => {
    if (!whitelistSearch.trim()) return allowedEmails;
    const q = whitelistSearch.toLowerCase().trim();
    return allowedEmails.filter(
      (item) => item.email.toLowerCase().includes(q) || item.addedBy.toLowerCase().includes(q)
    );
  }, [allowedEmails, whitelistSearch]);

  // Filtered Submissions for Spreadsheet
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (sheetEventFilter !== 'all' && s.eventId !== sheetEventFilter) {
        return false;
      }
      if (sheetSearch.trim()) {
        const q = sheetSearch.toLowerCase();
        const memberMatch = (s.memberName ?? '').toLowerCase().includes(q);
        const teamMembersMatch = (s.teamMembers ?? []).some((tm) => tm.toLowerCase().includes(q));
        const teamMatch = (s.teamName ?? '').toLowerCase().includes(q);
        const eventMatch = (s.eventTitle ?? '').toLowerCase().includes(q);
        const formMatch = Object.values(s.formData || {}).some((v) =>
          String(v).toLowerCase().includes(q)
        );
        return memberMatch || teamMembersMatch || teamMatch || eventMatch || formMatch;
      }
      return true;
    });
  }, [submissions, sheetEventFilter, sheetSearch]);

  // Dynamic Spreadsheet Columns
  const dynamicFormKeys = useMemo(() => {
    const keySet = new Set<string>();
    filteredSubmissions.forEach((s) => {
      if (s.formData) {
        Object.keys(s.formData).forEach((k) => keySet.add(k));
      }
    });
    return Array.from(keySet);
  }, [filteredSubmissions]);

  // Export to CSV Functionality with Full Team Attribution & QR Origin
  function exportToCSV() {
    if (filteredSubmissions.length === 0) {
      alert('No data available to export');
      return;
    }

    const headers = [
      'Submission ID',
      'Date & Time',
      'Event Name',
      'Attributed Marketing Personnel',
      'Team',
      'Scanned QR Owner / Source',
      'QR Code ID',
      ...dynamicFormKeys.map((k) => k.toUpperCase()),
    ];

    const rows = filteredSubmissions.map((s) => {
      const dt = new Date(s.createdAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const isTeamAssigned = Boolean(
        s.teamName &&
        !['general', 'unassigned'].includes(s.teamName.toLowerCase()) &&
        s.teamMembers &&
        s.teamMembers.length > 0
      );

      const marketingPersonnel = isTeamAssigned
        ? s.teamMembers!.join(', ')
        : (s.memberName || 'Direct Attendee');

      const scannedSource = s.scannedBy || s.memberName || (isTeamAssigned ? `${s.teamName} QR` : 'Direct');

      const dynamicVals = dynamicFormKeys.map((k) => {
        const val = s.formData ? s.formData[k] : '';
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      });

      return [
        `"${s.id}"`,
        `"${dt}"`,
        `"${(s.eventTitle || '').replace(/"/g, '""')}"`,
        `"${marketingPersonnel.replace(/"/g, '""')}"`,
        `"${(s.teamName || 'Unassigned').replace(/"/g, '""')}"`,
        `"${scannedSource.replace(/"/g, '""')}"`,
        `"${s.qrCodeId}"`,
        ...dynamicVals,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FED_Leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Copy scan link
  function copyScanLink() {
    if (!myQr) return;
    const url = `${window.location.origin}/scan?qr=${myQr.id}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  }

  // Download Full Attendee Pass Card Image (with FED Header, Event Name, QR, and Member/Team Footer)
  async function handleDownloadPass() {
    if (!myQr || !qrDataUrl) return;
    setDownloadingPass(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = qrDataUrl;
      });

      const hasTeam = Boolean(
        myQr.teamName && !['general', 'unassigned'].includes(myQr.teamName.toLowerCase())
      );

      const width = 720;
      const height = hasTeam ? 940 : 900;
      canvas.width = width;
      canvas.height = height;

      // Helper function for rounded rectangle
      const drawRoundedRect = (
        c: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
      ) => {
        if (typeof c.roundRect === 'function') {
          c.roundRect(x, y, w, h, r);
          return;
        }
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
      };

      // Fill 100% of the canvas with solid pure white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Clean subtle card border (light gray, not orange)
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e5e7eb';
      drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 24);
      ctx.stroke();

      let currY = 64;

      // 1. Header: FED KIIT • ATTENDEE PASS
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#111827';
      ctx.font = '900 24px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('FED KIIT • ATTENDEE PASS', width / 2, currY);

      currY += 36;

      // 2. Event Title
      ctx.fillStyle = '#4b5563';
      ctx.font = '600 20px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      let eventTitle = myQr.eventTitle || 'Official Event';
      if (eventTitle.length > 40) {
        eventTitle = eventTitle.slice(0, 38) + '...';
      }
      ctx.fillText(eventTitle, width / 2, currY);

      currY += 28;

      // 3. Center High-Res QR Code
      const qrSize = 480;
      const qrX = (width - qrSize) / 2;
      ctx.drawImage(img, qrX, currY, qrSize, qrSize);

      currY += qrSize + 24;

      // 4. Divider Line
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(width * 0.12, currY);
      ctx.lineTo(width * 0.88, currY);
      ctx.stroke();

      currY += 34;

      // 5. Member Name
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 24px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(myQr.memberName || user.name || 'FED Member', width / 2, currY);

      // 6. Team Name (if present)
      if (hasTeam) {
        currY += 28;
        ctx.fillStyle = '#4b5563';
        ctx.font = '600 18px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(myQr.teamName, width / 2, currY);
      }

      currY += 34;

      // 7. Footer Tagline
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 12px Inter, monospace';
      ctx.fillText('SCAN TO REGISTER • OFFICIAL ATTENDEE PASS', width / 2, currY);

      // Generate file download
      const sanitizedEvent = (myQr.eventTitle || 'Event').replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedName = (myQr.memberName || user.name || 'Pass').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `FED_Pass_${sanitizedEvent}_${sanitizedName}.png`;

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error generating pass image', err);
      alert('Failed to generate complete pass image');
    } finally {
      setDownloadingPass(false);
    }
  }

  // Leaderboards calculation for analytics: credits all members of the squad at submission time
  const memberLeaderboard = useMemo(() => {
    const counts: Record<string, { name: string; team: string; count: number }> = {};
    submissions.forEach((s) => {
      const isTeamAssigned = Boolean(
        s.teamName &&
        !['general', 'unassigned'].includes(s.teamName.toLowerCase()) &&
        s.teamMembers &&
        s.teamMembers.length > 0
      );

      if (isTeamAssigned && s.teamMembers) {
        // Team assigned: each member active in the team at that moment receives credit
        s.teamMembers.forEach((memName, idx) => {
          const memUid = s.creditedMemberIds && s.creditedMemberIds[idx] ? s.creditedMemberIds[idx] : memName;
          const key = memUid || memName;
          if (!counts[key]) {
            counts[key] = {
              name: memName,
              team: s.teamName || '',
              count: 0,
            };
          }
          counts[key].count += 1;
        });
      } else {
        // Single unassigned member or direct attribution
        const key = s.memberId || s.memberName || 'unassigned';
        if (!counts[key]) {
          counts[key] = {
            name: s.memberName || 'Direct Attendee',
            team: s.teamName && !['general', 'unassigned'].includes(s.teamName.toLowerCase()) ? s.teamName : '',
            count: 0,
          };
        }
        counts[key].count += 1;
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [submissions]);

  return (
    <div className="min-h-[100dvh] bg-[#09090b] text-[#e5e1e4] font-['Inter',sans-serif] pb-24 md:pb-12">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#121214]/90 backdrop-blur-md border-b border-[#27272a] px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c] ring-4 ring-[#ea580c]/20"></span>
              <span className="font-bold text-white tracking-tight text-base sm:text-lg">FED KIIT</span>
            </Link>
            <span className="text-zinc-600 hidden sm:inline">/</span>
            <span className="text-xs text-zinc-400 font-medium hidden sm:inline">Attribution Platform</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* User Badge */}
            <div className="flex items-center gap-2 bg-[#18181b] border border-[#27272a] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-white font-medium max-w-[110px] sm:max-w-none truncate">{user.name}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${isSuperAdmin
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                  : isAdmin
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'bg-[#ea580c]/15 text-[#ea580c] border border-[#ea580c]/30'
                  }`}
              >
                {user.role}
              </span>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-500 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <IconLogout className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 sm:py-6">
        {/* Navigation Tabs (Top Scrollable Bar) */}
        <div className="flex items-center gap-1.5 sm:gap-2 border-b border-[#27272a] pb-3 mb-5 overflow-x-auto no-scrollbar">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'overview'
                ? 'bg-[#ea580c] text-white shadow-md shadow-[#ea580c]/20'
                : 'text-zinc-400 hover:text-white hover:bg-[#18181b]'
                }`}
            >
              <IconAnalytics className="w-4 h-4" />
              <span>Overview</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('my-qr')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'my-qr'
              ? 'bg-[#ea580c] text-white shadow-md shadow-[#ea580c]/20'
              : 'text-zinc-400 hover:text-white hover:bg-[#18181b]'
              }`}
          >
            <IconQrCode className="w-4 h-4" />
            <span>My QR Code</span>
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('sheet')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'sheet'
                  ? 'bg-[#ea580c] text-white shadow-md shadow-[#ea580c]/20'
                  : 'text-zinc-400 hover:text-white hover:bg-[#18181b]'
                  }`}
              >
                <IconTable className="w-4 h-4" />
                <span>Submissions ({submissions.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('events')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'events'
                  ? 'bg-[#ea580c] text-white shadow-md shadow-[#ea580c]/20'
                  : 'text-zinc-400 hover:text-white hover:bg-[#18181b]'
                  }`}
              >
                <IconEvent className="w-4 h-4" />
                <span>Events</span>
              </button>

              <button
                onClick={() => setActiveTab('teams')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'teams'
                  ? 'bg-[#ea580c] text-white shadow-md shadow-[#ea580c]/20'
                  : 'text-zinc-400 hover:text-white hover:bg-[#18181b]'
                  }`}
              >
                <IconUsers className="w-4 h-4" />
                <span>Teams</span>
              </button>

              <button
                onClick={() => setActiveTab('whitelist')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'whitelist'
                  ? 'bg-[#ea580c] text-white shadow-md shadow-[#ea580c]/20'
                  : 'text-zinc-400 hover:text-white hover:bg-[#18181b]'
                  }`}
              >
                <IconShield className="w-4 h-4" />
                <span>Authorized</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                  {allowedEmails.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('roles')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'roles'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-purple-400 hover:text-white hover:bg-purple-950/40 border border-purple-500/20'
                  }`}
              >
                <IconAdmin className="w-4 h-4" />
                <span>Roles</span>
              </button>
            </>
          )}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & ANALYTICS (ADMIN / SUPERADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && isAdmin && (
          <div className="space-y-5 sm:space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-5 shadow-lg">
                <span className="text-zinc-400 text-xs sm:text-sm font-medium block mb-1">Total Submissions</span>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{submissions.length}</div>
                <span className="text-[11px] text-zinc-500 mt-1.5 block">Captured leads</span>
              </div>

              <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-5 shadow-lg">
                <span className="text-zinc-400 text-xs sm:text-sm font-medium block mb-1">Active Events</span>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {events.filter((e) => e.active).length}
                </div>
                <span className="text-[11px] text-zinc-500 mt-1.5 block">Of {events.length} total</span>
              </div>

              <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-5 shadow-lg">
                <span className="text-zinc-400 text-xs sm:text-sm font-medium block mb-1">Marketers</span>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{members.length}</div>
                <span className="text-[11px] text-zinc-500 mt-1.5 block">In {teams.length} teams</span>
              </div>

              <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-5 shadow-lg">
                <span className="text-zinc-400 text-xs sm:text-sm font-medium block mb-1">Top Member</span>
                <div className="text-lg sm:text-2xl font-bold text-[#ea580c] tracking-tight truncate">
                  {memberLeaderboard[0]?.name || 'None yet'}
                </div>
                <span className="text-[11px] text-zinc-500 mt-1.5 block">
                  {memberLeaderboard[0]?.count || 0} conversions
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
              <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-6 shadow-xl">
                <h3 className="text-sm sm:text-base font-bold text-white mb-4">Event Performance Breakdown</h3>
                <div className="space-y-3">
                  {events.map((ev) => {
                    const count = submissions.filter((s) => s.eventId === ev.id).length;
                    const pct = submissions.length > 0 ? (count / submissions.length) * 100 : 0;
                    return (
                      <div key={ev.id} className="p-3 sm:p-3.5 rounded-xl bg-[#18181b] border border-[#27272a]">
                        <div className="flex items-center justify-between text-xs sm:text-sm mb-2">
                          <span className="font-semibold text-white truncate max-w-[180px] sm:max-w-none">{ev.title}</span>
                          <span className="font-mono text-zinc-400 text-xs">
                            {count} leads ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full bg-[#27272a] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#ea580c] h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {events.length === 0 && (
                    <div className="py-8 text-center text-xs text-zinc-500">No events created yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-6 shadow-xl">
                <h3 className="text-sm sm:text-base font-bold text-white mb-4">Member Marketing Leaderboard</h3>
                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                  {memberLeaderboard.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-[#18181b] border border-[#27272a] text-xs sm:text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${idx === 0 ? 'bg-[#ea580c] text-white' : idx === 1 ? 'bg-zinc-300 text-black' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-[#27272a] text-zinc-400'
                          }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-semibold text-white block">{item.name}</span>
                          {item.team && <span className="text-zinc-500 text-[11px]">{item.team}</span>}
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-lg bg-[#ea580c]/10 text-[#ea580c] font-mono font-bold text-xs sm:text-sm">
                        {item.count} leads
                      </span>
                    </div>
                  ))}
                  {memberLeaderboard.length === 0 && (
                    <div className="py-8 text-center text-xs text-zinc-500">No attributed submissions recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: MY FIXED QR CODE (MEMBER & ADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'my-qr' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-5 sm:p-8 shadow-2xl">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">Marketing Member QR Station</h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
                  Select an event below. You receive <strong>1 fixed QR code</strong> for this event. Show it on your phone or print it. When attendees scan and submit, leads are credited to you.
                </p>
              </div>

              {/* Event Selector */}
              <div className="mb-6 space-y-1.5">
                <label className="block text-xs sm:text-sm text-zinc-300 font-medium">Select Active Event</label>
                <select
                  className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-all"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id} className="bg-[#121214] text-white">
                      {ev.title} {ev.active ? '(Active)' : '(Closed)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* QR Code Presentation Box */}
              {qrLoading ? (
                <div className="py-16 text-center text-zinc-400 text-xs font-mono flex flex-col items-center gap-3">
                  <div className="w-6 h-6 border-2 border-[#ea580c] border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating fixed QR code...</span>
                </div>
              ) : qrDataUrl && myQr ? (
                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-white border border-zinc-200 text-center max-w-[270px] sm:max-w-xs mx-auto shadow-2xl">
                    <div className="text-zinc-950 font-black text-sm tracking-tight mb-1 uppercase">
                      FED KIIT • Attendee Pass
                    </div>
                    <div className="text-zinc-600 text-xs mb-3 font-medium truncate">{myQr.eventTitle}</div>

                    <img src={qrDataUrl} alt="Fixed Marketing QR Code" className="w-full h-auto mx-auto rounded-xl" />

                    <div className="mt-3 pt-3 border-t border-zinc-200 text-zinc-900">
                      <div className="text-xs sm:text-sm font-bold">{myQr.memberName || 'FED Member'}</div>
                      {myQr.teamName && !['general', 'unassigned'].includes(myQr.teamName.toLowerCase()) && (
                        <div className="text-[11px] text-zinc-600 font-medium">{myQr.teamName}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={copyScanLink}
                      className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-500 text-xs sm:text-sm text-white font-medium transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                    >
                      <IconCopy className="w-4 h-4" />
                      <span>{copySuccess ? '✓ Link Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPass}
                      disabled={downloadingPass}
                      className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-xs sm:text-sm text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#ea580c]/20 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                    >
                      <IconDownload className="w-4 h-4" />
                      <span>{downloadingPass ? 'Generating Pass...' : 'Download PNG'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-center pt-1">
                    <a
                      href={qrDataUrl}
                      download={`FED_QR_Raw_${myQr.eventTitle.replace(/\s+/g, '_')}_${user.name.replace(/\s+/g, '_')}.png`}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors cursor-pointer"
                    >
                      Need only raw QR code without card? Download bare QR
                    </a>
                  </div>

                  <div className="pt-6 border-t border-[#27272a]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs sm:text-sm font-bold text-white">Your Leads for this Event</span>
                      <span className="px-2.5 py-1 rounded-full bg-[#ea580c]/10 text-[#ea580c] font-mono text-xs font-bold">
                        {
                          submissions.filter(
                            (s) => s.eventId === selectedEventId && isSubmissionCreditedToMember(s, user.uid, user.name)
                          ).length
                        }{' '}
                        Registrations
                      </span>
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-2">
                      {submissions
                        .filter(
                          (s) => s.eventId === selectedEventId && isSubmissionCreditedToMember(s, user.uid, user.name)
                        )
                        .map((s) => (
                          <div
                            key={s.id}
                            className="p-3 rounded-xl bg-[#18181b] border border-[#27272a] flex items-center justify-between text-xs sm:text-sm"
                          >
                            <span className="text-white font-medium">
                              {s.formData.name || s.formData.fullName || 'Attendee'}
                            </span>
                            <span className="text-zinc-500 font-mono text-xs">
                              {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      {submissions.filter(
                        (s) => s.eventId === selectedEventId && isSubmissionCreditedToMember(s, user.uid, user.name)
                      ).length === 0 && (
                        <div className="py-6 text-center text-xs text-zinc-500 bg-[#18181b]/50 rounded-xl border border-[#27272a]/40">
                          No registrations captured yet. Show your QR to attendees!
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-zinc-500">
                  Please select an event to view your fixed QR code.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: EVENTS & DYNAMIC FORM BUILDER (ADMIN / SUPERADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'events' && isAdmin && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Events & Registration Forms</h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Configure events and customize form parameters with required validation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowEventModal(true)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-xs sm:text-sm font-semibold text-white transition-all shadow-md shadow-[#ea580c]/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <IconPlus className="w-4 h-4" />
                <span>Create New Event</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((ev) => {
                const subCount = submissions.filter((s) => s.eventId === ev.id).length;
                return (
                  <div key={ev.id} className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-5 space-y-4 shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white truncate">{ev.title}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold shrink-0 ${ev.active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-400'
                              }`}
                          >
                            {ev.active ? 'Active' : 'Closed'}
                          </span>
                        </div>
                        {ev.description && <p className="text-xs text-zinc-400 mt-1 leading-relaxed line-clamp-2">{ev.description}</p>}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleEventActive(ev.id, ev.active)}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-500 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                      >
                        {ev.active ? 'Close Event' : 'Activate'}
                      </button>
                    </div>

                    <div>
                      <span className="text-[11px] text-zinc-500 block mb-2 font-mono uppercase">
                        Dynamic Form Parameters ({ev.formFields.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ev.formFields.map((f) => (
                          <span
                            key={f.id}
                            className="px-2.5 py-1 rounded-lg bg-[#18181b] border border-[#27272a] text-xs text-zinc-300 flex items-center gap-1 font-mono"
                          >
                            {f.label}
                            {f.required && <span className="text-[#ea580c] font-bold">*</span>}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#27272a] flex items-center justify-between text-xs text-zinc-500">
                      <span>Total Registrations: <strong className="text-white text-sm">{subCount}</strong></span>
                      <span className="font-mono text-[11px]">ID: {ev.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal: Create Event & Dynamic Form */}
            {showEventModal && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                <div className="bg-[#121214] border border-[#27272a] rounded-2xl max-w-2xl w-full p-5 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold text-white">Create Event &amp; Form</h3>
                    <button
                      type="button"
                      onClick={() => setShowEventModal(false)}
                      className="text-zinc-400 hover:text-white p-1 text-lg font-mono cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleCreateEvent} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs sm:text-sm text-zinc-300 font-medium">Event Title</label>
                      <input
                        required
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none"
                        placeholder="e.g. FED E-Summit '26"
                        value={newEventTitle}
                        onChange={(e) => setNewEventTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs sm:text-sm text-zinc-300 font-medium">Description</label>
                      <textarea
                        rows={2}
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none resize-none"
                        placeholder="Brief event overview shown on attendee registration page..."
                        value={newEventDesc}
                        onChange={(e) => setNewEventDesc(e.target.value)}
                      />
                    </div>

                    <div className="space-y-3 pt-3 border-t border-[#27272a]">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-white">Form Parameters</h4>
                          <p className="text-[11px] text-zinc-400">
                            Configure inputs and mark required fields
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addFormField}
                          className="px-3 py-1.5 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#ea580c] text-xs font-semibold text-[#ea580c] transition-colors cursor-pointer"
                        >
                          + Add Field
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {newEventFields.map((field, idx) => (
                          <div
                            key={field.id}
                            className="p-3 rounded-xl bg-[#18181b] border border-[#27272a] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs"
                          >
                            <div className="sm:col-span-4">
                              <input
                                required
                                className="w-full rounded-lg bg-[#09090b] border border-[#27272a] px-3 py-2 text-xs sm:text-sm text-white"
                                placeholder="Field Label (e.g. Roll No)"
                                value={field.label}
                                onChange={(e) => updateFormField(idx, 'label', e.target.value)}
                              />
                            </div>

                            <div className="sm:col-span-4">
                              <select
                                className="w-full rounded-lg bg-[#09090b] border border-[#27272a] px-3 py-2 text-xs sm:text-sm text-white"
                                value={field.type}
                                onChange={(e) => updateFormField(idx, 'type', e.target.value)}
                              >
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                                <option value="email">Email</option>
                                <option value="phone">Phone</option>
                                <option value="dropdown">Dropdown</option>
                                <option value="textarea">Textarea</option>
                              </select>
                            </div>

                            <div className="sm:col-span-3 flex items-center justify-between sm:justify-start gap-3">
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) => updateFormField(idx, 'required', e.target.checked)}
                                  className="accent-[#ea580c] w-4 h-4"
                                />
                                <span className={`text-xs font-medium ${field.required ? 'text-[#ea580c]' : 'text-zinc-400'}`}>
                                  Required
                                </span>
                              </label>

                              {newEventFields.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeFormField(idx)}
                                  className="text-red-400 hover:text-red-300 text-xs py-1 px-2 rounded hover:bg-red-950/30 cursor-pointer sm:hidden"
                                >
                                  Delete
                                </button>
                              )}
                            </div>

                            <div className="sm:col-span-1 text-right hidden sm:block">
                              {newEventFields.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeFormField(idx)}
                                  className="text-red-400 hover:text-red-300 text-xs p-1"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#27272a]">
                      <button
                        type="button"
                        onClick={() => setShowEventModal(false)}
                        className="px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-xs sm:text-sm text-zinc-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEvent}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-xs sm:text-sm font-semibold text-white transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#ea580c]/20"
                      >
                        {savingEvent ? 'Saving...' : 'Publish Event'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: IN-WEBSITE SPREADSHEET SHEET WITH CSV EXPORT (ADMIN / SUPERADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'sheet' && isAdmin && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Interactive Submissions</h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Real-time leads captured across all marketing QR codes.
                </p>
              </div>

              <button
                type="button"
                onClick={exportToCSV}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer active:scale-[0.99]"
              >
                <IconDownload className="w-4 h-4" />
                <span>Export to CSV / Excel</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-3.5 rounded-2xl bg-[#121214] border border-[#27272a] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 whitespace-nowrap font-medium">Event:</span>
                <select
                  className="w-full sm:w-auto rounded-xl bg-[#09090b] border border-[#27272a] px-3 py-2 text-xs sm:text-sm text-white focus:border-[#ea580c] focus:outline-none"
                  value={sheetEventFilter}
                  onChange={(e) => setSheetEventFilter(e.target.value)}
                >
                  <option value="all">All Events ({events.length})</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <input
                  className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none"
                  placeholder="Search attendee, member, phone, email, team..."
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                />
              </div>

              <div className="text-xs text-zinc-400 font-mono text-right sm:text-left">
                {filteredSubmissions.length} of {submissions.length} rows
              </div>
            </div>

            {/* Mobile Cards List (Phones) */}
            <div className="space-y-3 md:hidden">
              {filteredSubmissions.map((s) => {
                const primaryName = s.formData?.name || s.formData?.fullName || 'Attendee';
                const primaryPhone = s.formData?.phone || s.formData?.mobile;
                const primaryEmail = s.formData?.email;
                const isTeam = Boolean(
                  s.teamName &&
                  !['general', 'unassigned'].includes(s.teamName.toLowerCase()) &&
                  s.teamMembers &&
                  s.teamMembers.length > 0
                );
                const memberDisplay = isTeam
                  ? s.teamMembers!.join(', ')
                  : (s.memberName || 'Direct Attendee');

                return (
                  <div key={s.id} className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 space-y-3 shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm sm:text-base">{primaryName}</h4>
                        <span className="text-xs text-[#ea580c] font-semibold">{s.eventTitle}</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400 bg-[#18181b] px-2.5 py-1 rounded-lg border border-[#27272a]">
                        {new Date(s.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#27272a]/60">
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-mono">Attributed Personnel</span>
                        <span className="text-zinc-200 font-medium break-words block">{memberDisplay}</span>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-0.5">
                          <span>{s.teamName || 'Unassigned'}</span>
                          {s.scannedBy && <span>• via {s.scannedBy}</span>}
                        </div>
                      </div>
                      {primaryPhone && (
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Contact</span>
                          <a href={`tel:${primaryPhone}`} className="text-blue-400 font-mono text-xs hover:underline block truncate">
                            {primaryPhone}
                          </a>
                          {primaryEmail && <span className="text-zinc-400 text-[11px] truncate block">{primaryEmail}</span>}
                        </div>
                      )}
                    </div>

                    {/* Extra dynamic form fields */}
                    {dynamicFormKeys.filter((k) => !['name', 'fullname', 'phone', 'mobile', 'email'].includes(k.toLowerCase())).length > 0 && (
                      <div className="pt-2 border-t border-[#27272a]/40 flex flex-wrap gap-1.5 text-[11px]">
                        {dynamicFormKeys
                          .filter((k) => !['name', 'fullname', 'phone', 'mobile', 'email'].includes(k.toLowerCase()))
                          .map((k) => (
                            <span key={k} className="px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a] text-zinc-300">
                              <span className="text-zinc-500 mr-1">{k}:</span>
                              <span className="font-medium text-white">{String(s.formData?.[k] ?? '—')}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredSubmissions.length === 0 && (
                <div className="py-12 text-center text-zinc-500 text-xs bg-[#121214] rounded-2xl border border-[#27272a]">
                  No submissions match your search or filter.
                </div>
              )}
            </div>

            {/* Desktop Spreadsheet Table */}
            <div className="hidden md:block rounded-2xl bg-[#121214] border border-[#27272a] overflow-hidden shadow-xl">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs text-zinc-300 border-collapse">
                  <thead className="bg-[#18181b] border-b border-[#27272a] sticky top-0 z-10 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Event</th>
                      <th className="py-3 px-4">Marketing Personnel</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Scanned QR Source</th>
                      {dynamicFormKeys.map((k) => (
                        <th key={k} className="py-3 px-4 text-[#ea580c]">
                          {k}
                        </th>
                      ))}
                      <th className="py-3 px-4">QR Code ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27272a]/60">
                    {filteredSubmissions.map((s) => {
                      const isTeam = Boolean(
                        s.teamName &&
                        !['general', 'unassigned'].includes(s.teamName.toLowerCase()) &&
                        s.teamMembers &&
                        s.teamMembers.length > 0
                      );
                      const memberDisplay = isTeam
                        ? s.teamMembers!.join(', ')
                        : (s.memberName || 'Direct Attendee');
                      const qrSourceDisplay = s.scannedBy || s.memberName || (isTeam ? `${s.teamName} QR` : 'Direct');

                      return (
                        <tr key={s.id} className="hover:bg-[#18181b]/50 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                            {new Date(s.createdAt).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-white whitespace-nowrap">{s.eventTitle}</td>
                          <td className="py-2.5 px-4">
                            <span className="font-semibold text-white block max-w-xs truncate" title={memberDisplay}>
                              {memberDisplay}
                            </span>
                            {isTeam && (
                              <span className="text-[10px] text-zinc-500 block">
                                {s.teamMembers!.length} squad members credited
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                            {s.teamName || 'Unassigned'}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap text-zinc-300 font-mono text-[11px]">
                            {qrSourceDisplay}
                          </td>
                          {dynamicFormKeys.map((k) => (
                            <td key={k} className="py-2.5 px-4 whitespace-nowrap text-zinc-200">
                              {String(s.formData?.[k] ?? '—')}
                            </td>
                          ))}
                          <td className="py-2.5 px-4 font-mono text-[10px] text-zinc-500 whitespace-nowrap">
                            {s.qrCodeId}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredSubmissions.length === 0 && (
                      <tr>
                        <td colSpan={6 + dynamicFormKeys.length} className="py-12 text-center text-zinc-500 text-xs">
                          No submissions match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: TEAMS & MEMBERS (ADMIN / SUPERADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'teams' && isAdmin && (
          <div className="space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Teams & Marketing Personnel</h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Organize marketing executives into operational squads and track performance.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowMemberModal(true)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-xs sm:text-sm font-semibold text-white transition-all shadow-md shadow-[#ea580c]/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <IconUserPlus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>

            <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-4 sm:p-5 shadow-lg">
              <h3 className="text-xs font-bold text-white mb-3 uppercase font-mono tracking-wider">
                Create New Marketing Team
              </h3>
              <form onSubmit={handleCreateTeam} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  required
                  className="rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none flex-1"
                  placeholder="Team Name (e.g. Growth Squad Alpha)"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <input
                  className="rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none flex-1"
                  placeholder="Optional brief description"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={savingTeam}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-500 text-xs sm:text-sm font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {savingTeam ? 'Creating...' : 'Create Team'}
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase font-mono">Teams ({teams.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                  {teams.map((t) => {
                    const teamMems = members.filter((m) => m.teamId === t.id);
                    return (
                      <div key={t.id} className="p-4 rounded-2xl bg-[#121214] border border-[#27272a] shadow-md">
                        <div className="flex items-center justify-between text-xs sm:text-sm mb-1 gap-2">
                          <span className="font-bold text-white truncate max-w-[140px] sm:max-w-[160px]">{t.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-xs text-zinc-400 bg-[#18181b] px-2 py-0.5 rounded-md border border-[#27272a]">
                              {teamMems.length} members
                            </span>
                            <button
                              type="button"
                              disabled={deletingTeamId === t.id}
                              onClick={() => handleDeleteTeam(t.id, t.name)}
                              title={`Delete ${t.name} (Disbands team from today; preserves all past leads)`}
                              className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <IconTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {t.description && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t.description}</p>}
                        {teamMems.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-[#27272a]/60">
                            {teamMems.map((mem) => (
                              <span
                                key={mem.uid}
                                className="text-[10px] bg-[#18181b] text-zinc-300 px-2 py-0.5 rounded-md border border-[#27272a]/80 font-medium"
                              >
                                {mem.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase font-mono">Personnel Directory ({members.length})</h3>
                </div>

                {/* Mobile Personnel Cards (Phones) */}
                <div className="space-y-2.5 md:hidden">
                  {members.map((m) => {
                    const leadsCount = submissions.filter((s) => isSubmissionCreditedToMember(s, m.uid, m.name)).length;
                    return (
                      <div key={m.uid} className="p-4 rounded-2xl bg-[#121214] border border-[#27272a] shadow-md space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-white text-sm sm:text-base">{m.name}</h4>
                            <span className="text-xs text-zinc-400 font-mono">{m.email}</span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${m.role === 'superadmin'
                              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                              : m.role === 'admin'
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : 'bg-zinc-800 text-zinc-300'
                              }`}
                          >
                            {m.role}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/60 text-xs gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-zinc-500 font-mono text-[11px] shrink-0">Team:</span>
                            <select
                              value={m.teamId || ''}
                              disabled={updatingMemberTeamId === m.uid}
                              onChange={(e) => handleAssignMemberTeam(m.uid, e.target.value)}
                              className="bg-[#09090b] border border-[#27272a] hover:border-[#ea580c] text-xs text-white rounded-lg px-2 py-1 focus:outline-none focus:border-[#ea580c] transition-colors cursor-pointer truncate max-w-[140px] disabled:opacity-50"
                            >
                              <option value="" className="bg-[#121214] text-zinc-400">Unassigned</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id} className="bg-[#121214] text-white">
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <span className="font-mono font-bold text-[#ea580c] bg-[#ea580c]/10 px-2.5 py-0.5 rounded-md shrink-0">
                            {leadsCount} leads
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Personnel Table */}
                <div className="hidden md:block rounded-2xl bg-[#121214] border border-[#27272a] overflow-hidden shadow-xl">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-[#18181b] text-[11px] font-mono text-zinc-400 uppercase">
                      <tr>
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Team</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Total Leads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272a]/60">
                      {members.map((m) => {
                        const leadsCount = submissions.filter((s) => isSubmissionCreditedToMember(s, m.uid, m.name)).length;
                        return (
                          <tr key={m.uid} className="hover:bg-[#18181b]/50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-white">{m.name}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">{m.email}</td>
                            <td className="py-3 px-4">
                              <select
                                value={m.teamId || ''}
                                disabled={updatingMemberTeamId === m.uid}
                                onChange={(e) => handleAssignMemberTeam(m.uid, e.target.value)}
                                className="bg-[#09090b] border border-[#27272a] hover:border-[#ea580c] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#ea580c] transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <option value="" className="bg-[#121214] text-zinc-400">Unassigned</option>
                                {teams.map((t) => (
                                  <option key={t.id} value={t.id} className="bg-[#121214] text-white">
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${m.role === 'superadmin'
                                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                  : m.role === 'admin'
                                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                    : 'bg-zinc-800 text-zinc-300'
                                  }`}
                              >
                                {m.role}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#ea580c]">{leadsCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal: Add Member */}
            {showMemberModal && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                <div className="bg-[#121214] border border-[#27272a] rounded-2xl max-w-md w-full p-5 sm:p-7 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold text-white">Add Marketing Member</h3>
                    <button
                      type="button"
                      onClick={() => setShowMemberModal(false)}
                      className="text-zinc-400 hover:text-white text-base font-mono p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {memberCreateError && (
                    <div className="rounded-xl bg-red-950/40 border border-red-500/30 p-3 text-xs text-red-300">
                      {memberCreateError}
                    </div>
                  )}

                  <form onSubmit={handleCreateMember} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="block text-xs sm:text-sm font-medium text-zinc-300">Full Name</label>
                      <input
                        required
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white focus:border-[#ea580c] focus:outline-none"
                        placeholder="e.g. Priyanshu Das"
                        value={newMemName}
                        onChange={(e) => setNewMemName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs sm:text-sm font-medium text-zinc-300">Email</label>
                      <input
                        required
                        type="email"
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white focus:border-[#ea580c] focus:outline-none"
                        placeholder="priyanshu@kiit.ac.in"
                        value={newMemEmail}
                        onChange={(e) => setNewMemEmail(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs sm:text-sm font-medium text-zinc-300">Temporary Password</label>
                      <input
                        required
                        type="password"
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white focus:border-[#ea580c] focus:outline-none"
                        placeholder="At least 6 characters"
                        value={newMemPassword}
                        onChange={(e) => setNewMemPassword(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs sm:text-sm font-medium text-zinc-300">Assign Team</label>
                      <select
                        required
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white focus:border-[#ea580c] focus:outline-none"
                        value={newMemTeamId}
                        onChange={(e) => setNewMemTeamId(e.target.value)}
                      >
                        <option value="" disabled>
                          Select Team
                        </option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id} className="bg-[#121214] text-white">
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs sm:text-sm font-medium text-zinc-300">Role</label>
                      <select
                        className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2.5 text-sm text-white focus:border-[#ea580c] focus:outline-none"
                        value={newMemRole}
                        onChange={(e) => setNewMemRole(e.target.value as any)}
                      >
                        <option value="member" className="bg-[#121214] text-white">Executive (Marketing)</option>
                        <option value="admin" className="bg-[#121214] text-white">Admin</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#27272a]">
                      <button
                        type="button"
                        onClick={() => setShowMemberModal(false)}
                        className="px-4 py-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-xs sm:text-sm text-zinc-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingMember}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-xs sm:text-sm font-semibold text-white transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#ea580c]/20"
                      >
                        {savingMember ? 'Creating...' : 'Add Account'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: AUTHORIZED EMAILS / WHITELIST (ADMIN / SUPERADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'whitelist' && isAdmin && (
          <div className="space-y-5 sm:space-y-6">
            <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-5 sm:p-6 space-y-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-full bg-[#ea580c]/10 text-[#ea580c] border border-[#ea580c]/20">
                    Access Control Whitelist
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-2">
                    Authorized Emails Directory
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                    Only emails listed here (plus the system Superadmin) are permitted to create accounts or sign in.
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-2xl sm:text-3xl font-bold text-[#ea580c] font-mono">
                    {allowedEmails.length}
                  </div>
                  <div className="text-[11px] text-zinc-500 uppercase font-mono">
                    Authorized Accounts
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Add Card */}
            <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-5 sm:p-6 space-y-4 shadow-lg">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ea580c]"></span>
                Add Authorized Emails
              </h3>
              <p className="text-xs text-zinc-400">
                Paste one or multiple email addresses separated by <strong>commas, spaces, or newlines</strong>.
              </p>

              <form onSubmit={handleAddAllowedEmails} className="space-y-3">
                <textarea
                  rows={3}
                  className="w-full rounded-xl bg-[#09090b] border border-[#27272a] p-3.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none font-mono resize-none"
                  placeholder="e.g.&#10;aarav@kiit.ac.in&#10;priyanshu@kiit.ac.in, rahul@kiit.ac.in"
                  value={emailsInput}
                  onChange={(e) => setEmailsInput(e.target.value)}
                />

                {whitelistMessage && (
                  <div
                    className={`rounded-xl p-3 text-xs ${whitelistMessage.toLowerCase().includes('success')
                      ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-950/40 border border-red-500/30 text-red-300'
                      }`}
                  >
                    {whitelistMessage}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Duplicates are automatically detected and deduplicated.
                  </span>

                  <button
                    type="submit"
                    disabled={savingEmails || !emailsInput.trim()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-xs sm:text-sm font-semibold text-white transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#ea580c]/20"
                  >
                    {savingEmails ? 'Authorizing...' : '+ Authorize Emails'}
                  </button>
                </div>
              </form>
            </div>

            {/* List & Search */}
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-[#121214] border border-[#27272a] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase font-mono">
                  Authorized Personnel ({filteredAllowedEmails.length})
                </h3>

                <div className="min-w-[220px]">
                  <input
                    className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:outline-none"
                    placeholder="Search email address..."
                    value={whitelistSearch}
                    onChange={(e) => setWhitelistSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Mobile Whitelist Cards (Phones) */}
              <div className="space-y-2.5 md:hidden">
                {filteredAllowedEmails.map((item) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-[#121214] border border-[#27272a] shadow-md flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs sm:text-sm font-semibold text-white truncate block">{item.email}</span>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                        <span>By {item.addedBy}</span>
                        <span>•</span>
                        <span>{new Date(item.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={deletingEmailId === item.id}
                      onClick={() => handleRemoveAllowedEmail(item.id, item.email)}
                      className="shrink-0 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-950/20 hover:bg-red-900/40 text-red-300 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deletingEmailId === item.id ? '...' : 'Remove'}
                    </button>
                  </div>
                ))}

                {filteredAllowedEmails.length === 0 && (
                  <div className="py-10 text-center text-zinc-500 text-xs bg-[#121214] rounded-2xl border border-[#27272a]">
                    {whitelistSearch ? 'No authorized emails match your search.' : 'No authorized emails yet.'}
                  </div>
                )}
              </div>

              {/* Desktop Whitelist Table */}
              <div className="hidden md:block rounded-2xl bg-[#121214] border border-[#27272a] overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#18181b] text-[11px] font-mono text-zinc-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Authorized Email</th>
                      <th className="py-3 px-4">Added By</th>
                      <th className="py-3 px-4">Authorized On</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27272a]/60">
                    {filteredAllowedEmails.map((item) => (
                      <tr key={item.id} className="hover:bg-[#18181b]/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-white">
                          {item.email}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                          {item.addedBy}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 text-[11px]">
                          {new Date(item.addedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            disabled={deletingEmailId === item.id}
                            onClick={() => handleRemoveAllowedEmail(item.id, item.email)}
                            className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-950/20 hover:bg-red-900/40 text-red-300 text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {deletingEmailId === item.id ? 'Removing...' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredAllowedEmails.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-zinc-500 text-xs">
                          {whitelistSearch
                            ? 'No authorized emails match your search filter.'
                            : 'No emails added to the whitelist yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: ROLES & PRIVILEGES (ADMIN / SUPERADMIN) */}
        {/* ========================================================================= */}
        {activeTab === 'roles' && isAdmin && (
          <div className="space-y-5 sm:space-y-6">
            <div className="rounded-2xl bg-[#121214] border border-purple-500/30 p-5 space-y-2 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                <h2 className="text-base sm:text-lg font-bold text-white">Role & Privilege Management</h2>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Superadmins have full authority to appoint admins or superadmins and demote admins. Admins can promote members to Admin, and demote admins whom they personally promoted. Superadmins cannot be demoted.
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-[#121214] border border-[#27272a]">
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase font-mono">Privilege Assignment Directory</h3>
              </div>

              {/* Mobile Roles Cards (Phones) */}
              <div className="space-y-3 md:hidden">
                {members.map((m) => {
                  const isTargetSuperAdmin = m.role === 'superadmin';
                  const isTargetAdmin = m.role === 'admin';
                  const isTargetMember = m.role === 'member';

                  const canDemoteToMember =
                    !isTargetSuperAdmin &&
                    !isTargetMember &&
                    (isSuperAdmin || (isTargetAdmin && m.promotedBy === user.uid));

                  const canPromoteToAdmin = isTargetMember;
                  const canPromoteToSuperAdmin = isSuperAdmin && !isTargetSuperAdmin;

                  return (
                    <div key={m.uid} className="p-4 rounded-2xl bg-[#121214] border border-[#27272a] shadow-md space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-white text-sm sm:text-base">{m.name}</h4>
                          <span className="text-xs text-zinc-400 font-mono">{m.email}</span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold ${m.role === 'superadmin'
                              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                              : m.role === 'admin'
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : 'bg-zinc-800 text-zinc-300'
                              }`}
                          >
                            {m.role}
                          </span>
                          {isTargetAdmin && m.promotedByName && (
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              by {m.promotedBy === user.uid ? 'You' : m.promotedByName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons on mobile with big touch targets */}
                      <div className="pt-2 border-t border-[#27272a]/60 flex flex-wrap gap-2">
                        {canDemoteToMember && (
                          <button
                            type="button"
                            disabled={roleUpdatingUid === m.uid}
                            onClick={() => handleUpdateRole(m.uid, 'member')}
                            className="flex-1 min-h-[38px] px-3 py-2 rounded-xl text-xs font-semibold border border-[#27272a] bg-[#18181b] hover:border-zinc-500 text-zinc-300 transition-colors cursor-pointer"
                          >
                            Make Member
                          </button>
                        )}
                        {canPromoteToAdmin && (
                          <button
                            type="button"
                            disabled={roleUpdatingUid === m.uid}
                            onClick={() => handleUpdateRole(m.uid, 'admin')}
                            className="flex-1 min-h-[38px] px-3 py-2 rounded-xl text-xs font-semibold border border-blue-500/30 bg-blue-950/40 text-blue-300 hover:bg-blue-900/40 transition-colors cursor-pointer"
                          >
                            Make Admin
                          </button>
                        )}
                        {canPromoteToSuperAdmin && (
                          <button
                            type="button"
                            disabled={roleUpdatingUid === m.uid}
                            onClick={() => handleUpdateRole(m.uid, 'superadmin')}
                            className="flex-1 min-h-[38px] px-3 py-2 rounded-xl text-xs font-semibold border border-purple-500/30 bg-purple-950/40 text-purple-300 hover:bg-purple-900/40 transition-colors cursor-pointer"
                          >
                            Make Superadmin
                          </button>
                        )}
                        {!canDemoteToMember && !canPromoteToAdmin && !canPromoteToSuperAdmin && (
                          <span className="text-[11px] text-zinc-500 italic py-1">
                            {isTargetSuperAdmin ? 'Protected account' : 'No role actions available'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Roles Table */}
              <div className="hidden md:block rounded-2xl bg-[#121214] border border-[#27272a] overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#18181b] text-[11px] font-mono text-zinc-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Current Role</th>
                      <th className="py-3 px-4">Assign New Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27272a]/60">
                    {members.map((m) => {
                      const isTargetSuperAdmin = m.role === 'superadmin';
                      const isTargetAdmin = m.role === 'admin';
                      const isTargetMember = m.role === 'member';

                      const canDemoteToMember =
                        !isTargetSuperAdmin &&
                        !isTargetMember &&
                        (isSuperAdmin || (isTargetAdmin && m.promotedBy === user.uid));

                      const canPromoteToAdmin = isTargetMember;
                      const canPromoteToSuperAdmin = isSuperAdmin && !isTargetSuperAdmin;

                      return (
                        <tr key={m.uid} className="hover:bg-[#18181b]/50">
                          <td className="py-3 px-4 font-semibold text-white">{m.name}</td>
                          <td className="py-3 px-4 font-mono text-zinc-400">{m.email}</td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-block w-max px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${m.role === 'superadmin'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : m.role === 'admin'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-zinc-800 text-zinc-400'
                                  }`}
                              >
                                {m.role}
                              </span>
                              {isTargetAdmin && m.promotedByName && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  Promoted by: {m.promotedBy === user.uid ? 'You' : m.promotedByName}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={roleUpdatingUid === m.uid || !canDemoteToMember}
                                onClick={() => handleUpdateRole(m.uid, 'member')}
                                title={
                                  isTargetSuperAdmin
                                    ? 'Superadmins cannot be demoted'
                                    : isTargetAdmin && !isSuperAdmin && m.promotedBy !== user.uid
                                      ? 'Only the promoting admin or a Superadmin can demote this admin'
                                      : undefined
                                }
                                className="px-2.5 py-1 rounded text-[11px] border border-[#27272a] bg-[#18181b] hover:border-zinc-500 text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                Make Member
                              </button>
                              <button
                                disabled={roleUpdatingUid === m.uid || !canPromoteToAdmin}
                                onClick={() => handleUpdateRole(m.uid, 'admin')}
                                className="px-2.5 py-1 rounded text-[11px] border border-blue-500/30 bg-blue-950/30 text-blue-300 hover:bg-blue-900/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                Make Admin
                              </button>
                              {isSuperAdmin && (
                                <button
                                  disabled={roleUpdatingUid === m.uid || !canPromoteToSuperAdmin}
                                  onClick={() => handleUpdateRole(m.uid, 'superadmin')}
                                  className="px-2.5 py-1 rounded text-[11px] border border-purple-500/30 bg-purple-950/30 text-purple-300 hover:bg-purple-900/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  Make Superadmin
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar (Phones) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121214]/95 backdrop-blur-xl border-t border-[#27272a] px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom">
        {isAdmin ? (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-colors cursor-pointer ${activeTab === 'overview' ? 'text-[#ea580c] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <IconAnalytics className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my-qr')}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-colors cursor-pointer ${activeTab === 'my-qr' ? 'text-[#ea580c] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <IconQrCode className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">My QR</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-colors cursor-pointer ${activeTab === 'sheet' ? 'text-[#ea580c] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <IconTable className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Leads</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-colors cursor-pointer ${activeTab === 'events' ? 'text-[#ea580c] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <IconEvent className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Events</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('teams')}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-colors cursor-pointer ${['teams', 'whitelist', 'roles'].includes(activeTab) ? 'text-[#ea580c] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              <IconUsers className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Squads</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab('my-qr')}
            className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[#ea580c] w-full"
          >
            <IconQrCode className="w-5 h-5" />
            <span>My Attribution QR Station</span>
          </button>
        )}
      </nav>
    </div>
  );
}

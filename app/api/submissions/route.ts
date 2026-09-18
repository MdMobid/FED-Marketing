import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db, cleanForRtdb } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth';
import { dynamicSubmissionSchema } from '@/lib/validation';
import type { Submission, QRCodeRecord, EventRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/submissions - Retrieve submissions
// Admins/Superadmins: all or filtered by eventId/memberId/teamId
// Members: their own submissions or team submissions they were part of at time of submission
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const memberId = searchParams.get('memberId');
    const teamId = searchParams.get('teamId');

    const snap = await db.ref('submissions').get();
    const data = snap.val() ?? {};
    let submissions: Submission[] = Object.values(data);

    // Apply permissions filter:
    // Members only see submissions where they were individually or team credited at time of submission
    if (user.role === 'member') {
      submissions = submissions.filter((s) =>
        (s.creditedMemberIds && s.creditedMemberIds.includes(user.uid)) ||
        s.memberId === user.uid ||
        (s.teamMembers && user.name && s.teamMembers.includes(user.name))
      );
    } else {
      // Admin / Superadmin query filters
      if (eventId) {
        submissions = submissions.filter((s) => s.eventId === eventId);
      }
      if (memberId) {
        submissions = submissions.filter((s) =>
          (s.creditedMemberIds && s.creditedMemberIds.includes(memberId)) ||
          s.memberId === memberId
        );
      }
      if (teamId) {
        submissions = submissions.filter((s) => s.teamId === teamId);
      }
    }

    submissions.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ submissions });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch submissions';
    const status = message === 'UNAUTHENTICATED' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/submissions - Public attendee form submission (no login required)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { qrCodeId, formData } = dynamicSubmissionSchema.parse(body);

    // Retrieve QR code record
    const qrSnap = await db.ref(`qrCodes/${qrCodeId}`).get();
    if (!qrSnap.exists()) {
      return NextResponse.json({ error: 'Invalid QR Code' }, { status: 404 });
    }

    const qr = qrSnap.val() as QRCodeRecord;
    if (!qr.active) {
      return NextResponse.json({ error: 'This QR Code is inactive' }, { status: 400 });
    }

    // Retrieve Event record to validate form fields
    const eventSnap = await db.ref(`events/${qr.eventId}`).get();
    if (!eventSnap.exists()) {
      return NextResponse.json({ error: 'Associated event not found' }, { status: 404 });
    }

    const event = eventSnap.val() as EventRecord;
    if (!event.active) {
      return NextResponse.json({ error: 'This event is currently closed for registrations' }, { status: 400 });
    }

    // Validate required fields * (IMP)
    for (const field of event.formFields) {
      if (field.required) {
        const val = formData[field.id];
        if (val === undefined || val === null || String(val).trim() === '') {
          return NextResponse.json(
            { error: `Missing required field: ${field.label} * (IMP)` },
            { status: 400 }
          );
        }
      }
    }

    // Dynamic Live Attribution Snapshot at exact second of submission:
    let finalTeamId = 'unassigned';
    let finalTeamName = 'Unassigned';
    let creditedMemberIds: string[] = [];
    let teamMemberNames: string[] = [];
    let scannedBy: string | undefined = 'Direct';
    let memberId: string | undefined = qr.memberId;
    let memberName: string | undefined = qr.memberName;

    if (qr.type === 'member' && qr.memberId) {
      // Look up member's live profile to check current squad at this timestamp
      const userSnap = await db.ref(`users/${qr.memberId}`).get();
      if (userSnap.exists()) {
        const userProfile = userSnap.val();
        memberName = (userProfile.name as string) || memberName || 'Member';
        scannedBy = memberName;

        const currentTeamId = userProfile.teamId;
        if (currentTeamId && currentTeamId !== 'unassigned' && currentTeamId.trim() !== '') {
          // Member is currently assigned to a team
          const teamSnap = await db.ref(`teams/${currentTeamId}`).get();
          if (teamSnap.exists() && !teamSnap.val().deleted) {
            const team = teamSnap.val();
            finalTeamId = team.id;
            finalTeamName = team.name;
            const mIds: string[] = team.memberIds ?? [];
            creditedMemberIds = [...mIds];

            // Ensure scanning member is included in credited members
            if (!creditedMemberIds.includes(qr.memberId)) {
              creditedMemberIds.push(qr.memberId);
            }

            // Fetch live names for all credited team members
            if (creditedMemberIds.length > 0) {
              const profileSnaps = await Promise.all(
                creditedMemberIds.map((uid) => db.ref(`users/${uid}`).get())
              );
              teamMemberNames = profileSnaps
                .filter((s) => s.exists())
                .map((s) => s.val().name || 'Member');
            }
          } else {
            // Team disbanded or not found: treat as individual
            creditedMemberIds = [qr.memberId];
            teamMemberNames = [memberName];
          }
        } else {
          // Member is unassigned
          creditedMemberIds = [qr.memberId];
          teamMemberNames = [memberName];
        }
      } else {
        creditedMemberIds = [qr.memberId];
        teamMemberNames = [memberName || 'Member'];
      }
    } else if (qr.type === 'team' || qr.teamId) {
      // Scanned a Team QR
      const targetTeamId = qr.teamId;
      scannedBy = qr.teamName ? `${qr.teamName} QR` : 'Team QR';
      if (targetTeamId && targetTeamId !== 'unassigned') {
        const teamSnap = await db.ref(`teams/${targetTeamId}`).get();
        if (teamSnap.exists()) {
          const team = teamSnap.val();
          finalTeamId = team.id;
          finalTeamName = team.name;
          const mIds: string[] = team.memberIds ?? [];
          creditedMemberIds = [...mIds];

          if (creditedMemberIds.length > 0) {
            const profileSnaps = await Promise.all(
              creditedMemberIds.map((uid) => db.ref(`users/${uid}`).get())
            );
            teamMemberNames = profileSnaps
              .filter((s) => s.exists())
              .map((s) => s.val().name || 'Member');
          }
        }
      }
    }

    const submissionId = `sub_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const submission: Submission = {
      id: submissionId,
      eventId: event.id,
      eventTitle: event.title,
      qrCodeId: qr.id,
      teamId: finalTeamId,
      teamName: finalTeamName,
      memberId,
      memberName,
      creditedMemberIds,
      teamMembers: teamMemberNames,
      scannedBy,
      formData,
      createdAt: Date.now(),
    };

    // Save permanent snapshot to Firebase RTDB
    await db.ref(`submissions/${submissionId}`).set(cleanForRtdb(submission));

    // Also update legacy leads table for backward compatibility
    const legacyLead = {
      id: submissionId,
      qrCodeId: qr.id,
      teamId: finalTeamId,
      teamName: finalTeamName,
      memberId: memberId ?? '',
      memberName: memberName ?? '',
      creditedMemberIds,
      teamMembers: teamMemberNames,
      scannedBy,
      name: formData.name || formData.fullName || 'Attendee',
      phone: formData.phone || formData.mobile || '',
      email: formData.email || '',
      createdAt: Date.now(),
      syncStatus: 'pending',
      syncAttempts: 0,
    };
    await db.ref(`leads/${submissionId}`).set(cleanForRtdb(legacyLead)).catch(() => { });

    return NextResponse.json({ success: true, submissionId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid form submission' },
      { status: 400 }
    );
  }
}

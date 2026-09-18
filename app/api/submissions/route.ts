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
// Members: their own submissions or their team's submissions
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

    // Apply permissions filter
    if (user.role === 'member') {
      submissions = submissions.filter((s) => s.memberId === user.uid || (user.teamId && s.teamId === user.teamId));
    } else {
      // Admin / Superadmin query filters
      if (eventId) {
        submissions = submissions.filter((s) => s.eventId === eventId);
      }
      if (memberId) {
        submissions = submissions.filter((s) => s.memberId === memberId);
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

    const submissionId = `sub_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const submission: Submission = {
      id: submissionId,
      eventId: event.id,
      eventTitle: event.title,
      qrCodeId: qr.id,
      teamId: qr.teamId,
      teamName: qr.teamName,
      memberId: qr.memberId,
      memberName: qr.memberName,
      teamMembers: qr.teamMembers,
      formData,
      createdAt: Date.now(),
    };

    // Save to Firebase RTDB
    await db.ref(`submissions/${submissionId}`).set(cleanForRtdb(submission));

    // Also update legacy leads table for backward compatibility if name/phone/email provided
    const legacyLead = {
      id: submissionId,
      qrCodeId: qr.id,
      teamId: qr.teamId,
      memberId: qr.memberId ?? '',
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

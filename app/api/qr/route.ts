import { NextResponse } from 'next/server';
import { db, cleanForRtdb } from '@/lib/firebase-admin';
import { requireUser } from '@/lib/auth';
import type { QRCodeRecord, EventRecord, UserProfile, TeamRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/qr
// Case 1: Public lookup by ?id=... (Used by /scan?qr=... to load QR & event info)
// Case 2: Authenticated fetch/get-or-create fixed QR by ?eventId=... (&optional memberId / teamId)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    // Case 1: Direct lookup by QR ID (Public for attendees scanning)
    if (id) {
      const snap = await db.ref(`qrCodes/${id}`).get();
      if (!snap.exists()) {
        return NextResponse.json({ error: 'QR Code not found' }, { status: 404 });
      }
      const qr = snap.val() as QRCodeRecord;
      if (!qr.active) {
        return NextResponse.json({ error: 'This QR Code is currently inactive' }, { status: 400 });
      }

      // Also get event details to provide form fields directly
      const eventSnap = await db.ref(`events/${qr.eventId}`).get();
      const event = eventSnap.exists() ? (eventSnap.val() as EventRecord) : null;

      return NextResponse.json({ qr, event });
    }

    // Case 2: Member or Admin fetching / creating fixed QR for an event
    const user = await requireUser();
    const eventId = searchParams.get('eventId');
    const targetMemberId = searchParams.get('memberId') || user.uid;
    const targetTeamId = searchParams.get('teamId');
    const qrType = targetTeamId && !searchParams.get('memberId') ? 'team' : 'member';

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    // Verify event exists
    const eventSnap = await db.ref(`events/${eventId}`).get();
    if (!eventSnap.exists()) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = eventSnap.val() as EventRecord;

    // Fixed deterministic QR ID: 1 Fixed QR for 1 Member for 1 Event
    const qrId = qrType === 'team'
      ? `qr_${eventId}_team_${targetTeamId}`
      : `qr_${eventId}_${targetMemberId}`;

    const existingSnap = await db.ref(`qrCodes/${qrId}`).get();
    if (existingSnap.exists()) {
      return NextResponse.json({ qr: existingSnap.val() as QRCodeRecord });
    }

    // Lookup user & team details
    let memberProfile: UserProfile | null = null;
    let teamId = targetTeamId || '';
    let teamName = '';
    let teamMembers: string[] = [];

    if (qrType === 'member') {
      const userSnap = await db.ref(`users/${targetMemberId}`).get();
      if (userSnap.exists()) {
        memberProfile = userSnap.val() as UserProfile;
        teamId = memberProfile.teamId || teamId;
        teamName = memberProfile.teamName || '';
      }
    }

    if (teamId) {
      const teamSnap = await db.ref(`teams/${teamId}`).get();
      if (teamSnap.exists()) {
        const team = teamSnap.val() as TeamRecord;
        teamName = team.name;

        // Fetch all member names belonging to this team
        if (team.memberIds && team.memberIds.length > 0) {
          const userPromises = team.memberIds.map((uid) => db.ref(`users/${uid}`).get());
          const userSnaps = await Promise.all(userPromises);
          teamMembers = userSnaps
            .filter((s) => s.exists())
            .map((s) => (s.val() as UserProfile).name);
        }
      }
    }

    // Create the fixed QRCodeRecord (use cleanForRtdb to ensure no undefined values are stored)
    const newQr: any = {
      id: qrId,
      eventId: event.id,
      eventTitle: event.title,
      type: qrType,
      teamId: teamId || 'unassigned',
      teamName: teamName || '',
      active: true,
      createdAt: Date.now(),
    };

    if (qrType === 'member') {
      newQr.memberId = targetMemberId;
      newQr.memberName = memberProfile?.name || user.name || 'Member';
    }

    if (teamMembers.length > 0) {
      newQr.teamMembers = teamMembers;
    }

    await db.ref(`qrCodes/${qrId}`).set(cleanForRtdb(newQr));
    return NextResponse.json({ qr: newQr as QRCodeRecord });
  } catch (e) {
    console.error('QR API error:', e);
    const message = e instanceof Error ? e.message : 'Failed to retrieve or generate QR code';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

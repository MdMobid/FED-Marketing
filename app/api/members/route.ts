import { NextResponse } from 'next/server';
import { adminAuth, db, cleanForRtdb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth';
import { memberCreateSchema } from '@/lib/validation';
import type { UserProfile, TeamRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/members - List all members and admins (Admin/Superadmin only)
export async function GET() {
  try {
    await requireAdmin();
    const usersSnap = await db.ref('users').get();
    const usersData = usersSnap.val() ?? {};
    const users: UserProfile[] = Object.values(usersData);

    // Fetch team lookup
    const teamsSnap = await db.ref('teams').get();
    const teamsData: Record<string, TeamRecord> = teamsSnap.val() ?? {};

    // Attach team names
    const enriched = users.map((u) => ({
      ...u,
      teamName: u.teamId && teamsData[u.teamId] ? teamsData[u.teamId].name : u.teamName || 'Unassigned',
    }));

    enriched.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ members: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch members';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/members - Create a new member or admin account
export async function POST(req: Request) {
  try {
    const caller = await requireAdmin();
    const body = await req.json();
    const parsed = memberCreateSchema.parse(body);

    // Get team info
    const teamSnap = await db.ref(`teams/${parsed.teamId}`).get();
    const teamName = teamSnap.exists() ? (teamSnap.val() as TeamRecord).name : 'Unassigned';

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email: parsed.email,
      password: parsed.password,
      displayName: parsed.name,
    });

    // Set custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: parsed.role,
      admin: parsed.role === 'admin',
    });

    // Save profile to RTDB
    const profile: UserProfile = {
      uid: userRecord.uid,
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      teamId: parsed.teamId,
      teamName,
      active: true,
      createdAt: Date.now(),
      promotedBy: parsed.role === 'admin' ? caller.uid : undefined,
      promotedByName: parsed.role === 'admin' ? caller.name : undefined,
    };

    await db.ref(`users/${userRecord.uid}`).set(cleanForRtdb(profile));

    // Add member to team's memberIds array
    if (teamSnap.exists()) {
      const team = teamSnap.val() as TeamRecord;
      const memberIds = team.memberIds ?? [];
      if (!memberIds.includes(userRecord.uid)) {
        memberIds.push(userRecord.uid);
        await db.ref(`teams/${parsed.teamId}/memberIds`).set(memberIds);
      }
    }

    return NextResponse.json({ success: true, member: profile });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create member';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH /api/members - Assign or update team for an existing member (Admin/Superadmin only)
export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { memberId, teamId } = body;

    if (!memberId || typeof memberId !== 'string') {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    // Fetch existing user profile
    const userSnap = await db.ref(`users/${memberId}`).get();
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    const userProfile = userSnap.val() as UserProfile;
    const oldTeamId = userProfile.teamId;

    let newTeamName = 'Unassigned';
    const isAssigning = Boolean(teamId && teamId !== 'unassigned' && teamId.trim() !== '');

    if (isAssigning) {
      const teamSnap = await db.ref(`teams/${teamId}`).get();
      if (!teamSnap.exists()) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 });
      }
      const newTeam = teamSnap.val() as TeamRecord;
      newTeamName = newTeam.name;

      // Add to new team's memberIds
      const memberIds = newTeam.memberIds ?? [];
      if (!memberIds.includes(memberId)) {
        memberIds.push(memberId);
        await db.ref(`teams/${teamId}/memberIds`).set(memberIds);
      }
    }

    // Remove from old team's memberIds if switching or unassigning
    if (oldTeamId && oldTeamId !== teamId) {
      const oldTeamSnap = await db.ref(`teams/${oldTeamId}`).get();
      if (oldTeamSnap.exists()) {
        const oldTeam = oldTeamSnap.val() as TeamRecord;
        const updatedIds = (oldTeam.memberIds ?? []).filter((id) => id !== memberId);
        await db.ref(`teams/${oldTeamId}/memberIds`).set(updatedIds);
      }
    }

    // Update user profile in RTDB
    await db.ref(`users/${memberId}`).update(
      cleanForRtdb({
        teamId: isAssigning ? teamId : null,
        teamName: newTeamName,
      })
    );

    // Sync all existing member QR codes so attendee passes reflect their updated squad
    try {
      const qrSnap = await db.ref('qrCodes').orderByChild('memberId').equalTo(memberId).get();
      if (qrSnap.exists()) {
        const qrs = qrSnap.val();
        const updates: Record<string, any> = {};
        for (const qId of Object.keys(qrs)) {
          updates[`qrCodes/${qId}/teamId`] = isAssigning ? teamId : 'unassigned';
          updates[`qrCodes/${qId}/teamName`] = isAssigning ? newTeamName : '';
        }
        await db.ref().update(updates);
      }
    } catch (e) {
      console.warn('Could not sync qrCodes for member team update', e);
    }

    return NextResponse.json({
      success: true,
      memberId,
      teamId: isAssigning ? teamId : null,
      teamName: newTeamName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update member team';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

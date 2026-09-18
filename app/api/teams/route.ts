import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/firebase-admin';
import { requireAdmin, requireUser } from '@/lib/auth';
import { teamSchema } from '@/lib/validation';
import type { TeamRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/teams - List all teams (filters out deleted teams unless ?all=true)
export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const includeDeleted = searchParams.get('all') === 'true';

    const snap = await db.ref('teams').get();
    const data = snap.val() ?? {};
    let teams: TeamRecord[] = Object.values(data);
    if (!includeDeleted) {
      teams = teams.filter((t) => !t.deleted);
    }
    teams.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ teams });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch teams';
    const status = message === 'UNAUTHENTICATED' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/teams - Create a team (Admin/Superadmin only)
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = teamSchema.parse(body);

    const id = `team_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const newTeam: TeamRecord = {
      id,
      name: parsed.name,
      description: parsed.description ?? '',
      memberIds: [],
      createdAt: Date.now(),
    };

    await db.ref(`teams/${id}`).set(newTeam);
    return NextResponse.json({ success: true, team: newTeam });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create team';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/teams?id=... - Soft delete / disband a team with timestamp
export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('id');

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    const teamSnap = await db.ref(`teams/${teamId}`).get();
    if (!teamSnap.exists()) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const team = teamSnap.val() as TeamRecord;
    const now = Date.now();

    // 1. Mark team as deleted with timestamp (preserves record in RTDB for historical references)
    await db.ref(`teams/${teamId}`).update({
      deleted: true,
      deletedAt: now,
      memberIds: [],
    });

    // 2. Unassign all current members of this team for future registrations
    const usersSnap = await db.ref('users').orderByChild('teamId').equalTo(teamId).get();
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      const userUpdates: Record<string, any> = {};
      for (const uid of Object.keys(users)) {
        userUpdates[`users/${uid}/teamId`] = null;
        userUpdates[`users/${uid}/teamName`] = 'Unassigned';
      }
      await db.ref().update(userUpdates);
    }

    // 3. Update active member QR codes so future scans are not attributed to the deleted team
    const qrSnap = await db.ref('qrCodes').orderByChild('teamId').equalTo(teamId).get();
    if (qrSnap.exists()) {
      const qrs = qrSnap.val();
      const qrUpdates: Record<string, any> = {};
      for (const qId of Object.keys(qrs)) {
        qrUpdates[`qrCodes/${qId}/teamId`] = 'unassigned';
        qrUpdates[`qrCodes/${qId}/teamName`] = '';
      }
      await db.ref().update(qrUpdates);
    }

    // CRITICAL: Existing submissions are NEVER deleted or touched.
    // All past registrations created prior to `now` permanently retain the teamName, teamId,
    // memberName, and memberId as originally submitted.

    return NextResponse.json({
      success: true,
      deletedTeamId: teamId,
      deletedAt: now,
      message: `Team "${team.name}" disbanded. Past registrations remain preserved.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete team';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

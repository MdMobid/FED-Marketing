import { NextResponse } from 'next/server';
import { adminAuth, db, cleanForRtdb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth';
import { userRoleUpdateSchema } from '@/lib/validation';
import type { UserProfile, TeamRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/roles - Hierarchical role update:
// 1. No one can make superadmin as admin or member.
// 2. No admin can make another admin as member (only if he/she was promoted by that admin, else superadmin can).
// 3. Only superadmin can assign someone as superadmin.
export async function POST(req: Request) {
  try {
    const caller = await requireAdmin();
    const body = await req.json();
    const parsed = userRoleUpdateSchema.parse(body);

    // Prevent modifying own role
    if (parsed.targetUid === caller.uid && parsed.role !== caller.role) {
      return NextResponse.json(
        { error: 'You cannot change your own role.' },
        { status: 400 }
      );
    }

    const userRef = db.ref(`users/${parsed.targetUid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const currentProfile = userSnap.val() as UserProfile;

    // RULE 1: No one can make superadmin as admin or member
    if (currentProfile.role === 'superadmin' && parsed.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Superadmin accounts cannot be demoted to admin or member by anyone.' },
        { status: 403 }
      );
    }

    // Only superadmin can assign superadmin role
    if (parsed.role === 'superadmin' && caller.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only a Superadmin can appoint a Superadmin.' },
        { status: 403 }
      );
    }

    // RULE 2: No admin can make another admin as member, UNLESS:
    // - Caller is superadmin (superadmin can demote any admin), OR
    // - Caller was the one who promoted that target admin
    if (currentProfile.role === 'admin' && parsed.role === 'member') {
      if (caller.role !== 'superadmin') {
        const wasPromotedByCaller = currentProfile.promotedBy === caller.uid;
        if (!wasPromotedByCaller) {
          return NextResponse.json(
            {
              error:
                'You cannot demote this admin. An admin can only be demoted by a Superadmin or the admin who originally promoted them.',
            },
            { status: 403 }
          );
        }
      }
    }

    // Optional team update
    let teamName = currentProfile.teamName;
    if (parsed.teamId && parsed.teamId !== currentProfile.teamId) {
      const teamSnap = await db.ref(`teams/${parsed.teamId}`).get();
      if (teamSnap.exists()) {
        teamName = (teamSnap.val() as TeamRecord).name;
      }
    }

    // Set custom user claims in Firebase Auth
    await adminAuth.setCustomUserClaims(parsed.targetUid, {
      role: parsed.role,
      superadmin: parsed.role === 'superadmin',
      admin: parsed.role === 'admin' || parsed.role === 'superadmin',
    });

    const updates: Record<string, any> = {
      role: parsed.role,
    };

    // Track attribution when promoting to admin
    if (parsed.role === 'admin') {
      updates.promotedBy = caller.uid;
      updates.promotedByName = caller.name;
    } else if (parsed.role === 'member') {
      // Clear promotion attribution when demoted back to member
      updates.promotedBy = null;
      updates.promotedByName = null;
    }

    if (parsed.teamId) {
      updates.teamId = parsed.teamId;
      updates.teamName = teamName;
    }

    await userRef.update(cleanForRtdb(updates));

    const updatedProfile: UserProfile = {
      ...currentProfile,
      ...updates,
    };

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update user role';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

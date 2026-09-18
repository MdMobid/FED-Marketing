import { NextResponse } from 'next/server';
import { adminAuth, db, cleanForRtdb } from '@/lib/firebase-admin';
import { isEmailAllowed } from '@/lib/auth';
import type { Role, UserProfile, TeamRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { name, email, password, teamId } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Enforce Whitelist: Only emails added by admins/superadmins can sign up
    const allowed = await isEmailAllowed(email);
    if (!allowed) {
      return NextResponse.json(
        {
          error:
            'This email is not authorized to register. Please request an administrator or superadmin to add your email to the authorized access list.',
        },
        { status: 403 }
      );
    }

    // Determine role: if matches SUPERADMIN_EMAIL env var, grant superadmin automatically
    const superAdminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
    const isSuperAdmin = superAdminEmail && email.toLowerCase().trim() === superAdminEmail;
    const role: Role = isSuperAdmin ? 'superadmin' : 'member';

    // Fetch team name if teamId provided
    let teamName = 'Unassigned';
    if (teamId) {
      const teamSnap = await db.ref(`teams/${teamId}`).get();
      if (teamSnap.exists()) {
        teamName = (teamSnap.val() as TeamRecord).name;
      }
    }

    // Create user in Firebase Auth (or recover if created during previous network/RTDB error)
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: name,
      });
    } catch (createErr: any) {
      if (createErr?.code === 'auth/email-already-exists') {
        userRecord = await adminAuth.getUserByEmail(email);
        await adminAuth.updateUser(userRecord.uid, { password, displayName: name });
      } else {
        throw createErr;
      }
    }

    // Set custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role,
      superadmin: isSuperAdmin,
      admin: isSuperAdmin,
    });

    // Store user profile in Realtime Database (sanitized so no undefined fields exist)
    const profile: any = {
      uid: userRecord.uid,
      name,
      email,
      role,
      active: true,
      createdAt: Date.now(),
    };
    if (teamId) {
      profile.teamId = teamId;
      profile.teamName = teamName;
    }

    await db.ref(`users/${userRecord.uid}`).set(cleanForRtdb(profile));

    // If team assigned, push UID to team's memberIds
    if (teamId) {
      const teamSnap = await db.ref(`teams/${teamId}`).get();
      if (teamSnap.exists()) {
        const team = teamSnap.val() as TeamRecord;
        const memberIds = team.memberIds ?? [];
        if (!memberIds.includes(userRecord.uid)) {
          memberIds.push(userRecord.uid);
          await db.ref(`teams/${teamId}/memberIds`).set(memberIds);
        }
      }
    }

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (e: any) {
    console.error('Registration error:', e);
    const code = e?.code;
    let message = 'Failed to register account';
    if (code === 'auth/email-already-exists') {
      message = 'An account with this email already exists. Please sign in instead.';
    } else if (code === 'auth/invalid-email') {
      message = 'Invalid email address provided.';
    } else if (e instanceof Error) {
      message = e.message;
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

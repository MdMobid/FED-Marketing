import { cookies } from 'next/headers';
import { adminAuth, db } from './firebase-admin';
import type { Role, UserProfile } from '@/types';

export type AuthUser = {
  uid: string;
  email: string;
  name: string;
  role: Role;
  teamId?: string;
};

export async function requireUser(): Promise<AuthUser> {
  const token = (await cookies()).get('session')?.value;
  if (!token) throw new Error('UNAUTHENTICATED');

  const decoded = await adminAuth.verifySessionCookie(token, true);
  const uid = decoded.uid;
  const email = decoded.email ?? '';

  // Check if user is configured as superadmin via environment variable
  const superAdminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const isEnvSuperAdmin = superAdminEmail && email.toLowerCase().trim() === superAdminEmail;

  // Retrieve user record from Firebase Realtime Database
  let role: Role = 'member';
  let name = decoded.name ?? email.split('@')[0] ?? 'User';
  let teamId: string | undefined = undefined;

  try {
    const snap = await db.ref(`users/${uid}`).get();
    if (snap.exists()) {
      const profile = snap.val() as UserProfile;
      role = profile.role ?? 'member';
      name = profile.name ?? name;
      teamId = profile.teamId;
    } else {
      // First time or user document not yet created
      if (isEnvSuperAdmin) {
        role = 'superadmin';
        await db.ref(`users/${uid}`).set({
          uid,
          name,
          email,
          role: 'superadmin',
          active: true,
          createdAt: Date.now(),
        });
      }
    }
  } catch (e) {
    console.error('Error fetching user profile:', e);
  }

  if (isEnvSuperAdmin || decoded.superadmin === true) {
    role = 'superadmin';
  } else if (decoded.admin === true && role !== 'superadmin') {
    role = 'admin';
  }

  return {
    uid,
    email,
    name,
    role,
    teamId,
  };
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export async function requireSuperAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== 'superadmin') {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export async function isEmailAllowed(rawEmail: string): Promise<boolean> {
  const normalized = rawEmail.toLowerCase().trim();
  const superAdminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  if (superAdminEmail && normalized === superAdminEmail) {
    return true;
  }

  try {
    const snap = await db.ref('allowedEmails').get();
    if (snap.exists()) {
      const records = snap.val() as Record<string, { email: string }>;
      return Object.values(records).some(
        (r) => r.email && r.email.toLowerCase().trim() === normalized
      );
    }
  } catch (err) {
    console.error('Error checking allowed emails:', err);
  }

  return false;
}

export async function purgeUnauthorizedUser(uid: string): Promise<void> {
  // 1. Delete from Firebase Authentication
  try {
    await adminAuth.deleteUser(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      console.error('Error deleting user from Auth:', err);
    }
  }

  // 2. Delete user profile from RTDB
  try {
    await db.ref(`users/${uid}`).remove();
  } catch (err) {
    console.error('Error removing user from RTDB:', err);
  }

  // 3. Delete any QR codes associated with this user
  try {
    const qrSnap = await db.ref('qrCodes').orderByChild('memberId').equalTo(uid).get();
    if (qrSnap.exists()) {
      const qrData = qrSnap.val();
      const updates: Record<string, null> = {};
      Object.keys(qrData).forEach((qrId) => {
        updates[`qrCodes/${qrId}`] = null;
      });
      await db.ref().update(updates);
    }
  } catch (err) {
    console.error('Error purging QR codes:', err);
  }

  // 4. Remove from teams
  try {
    const teamsSnap = await db.ref('teams').get();
    if (teamsSnap.exists()) {
      const teams = teamsSnap.val();
      for (const teamId of Object.keys(teams)) {
        const team = teams[teamId];
        if (Array.isArray(team?.memberIds) && team.memberIds.includes(uid)) {
          const updated = team.memberIds.filter((id: string) => id !== uid);
          await db.ref(`teams/${teamId}/memberIds`).set(updated);
        }
      }
    }
  } catch (err) {
    console.error('Error purging team membership:', err);
  }
}



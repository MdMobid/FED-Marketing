import { NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebase-admin';
import { isEmailAllowed, purgeUnauthorizedUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || '';
    const uid = decoded.uid;

    // Check if user email is in the authorized whitelist
    const allowed = await isEmailAllowed(email);
    if (!allowed) {
      // User requirement: "if unauthorized and tried to sign in, purge all data of him/her whether with google or email"
      // Purge all data: Firebase Auth, RTDB user profile, QR codes, and team memberships
      await purgeUnauthorizedUser(uid);

      return NextResponse.json(
        {
          error:
            'Your email is not on the authorized access list. This account was denied access and purged. Please contact an admin or superadmin to whitelist your email.',
        },
        { status: 403 }
      );
    }

    // Ensure user profile exists in Realtime Database (e.g. for first-time Google sign-in)
    const userRef = db.ref(`users/${uid}`);
    const userSnap = await userRef.get();
    const superAdminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
    const isSuperAdmin = superAdminEmail && email.toLowerCase().trim() === superAdminEmail;

    if (!userSnap.exists()) {
      const defaultRole = isSuperAdmin ? 'superadmin' : 'member';
      await userRef.set({
        uid,
        name: decoded.name || email.split('@')[0] || 'Member',
        email,
        role: defaultRole,
        active: true,
        createdAt: Date.now(),
      });

      await adminAuth.setCustomUserClaims(uid, {
        role: defaultRole,
        admin: isSuperAdmin,
        superadmin: isSuperAdmin,
      });
    }

    const session = await adminAuth.createSessionCookie(token, {
      expiresIn: 1000 * 60 * 60 * 24 * 5,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set('session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 5,
    });
    return res;
  } catch (e: any) {
    const message = e?.message || 'Invalid token';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

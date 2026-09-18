'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import Link from 'next/link';
import type { TeamRecord } from '@/types';

function formatAuthError(err: any): string {
  const code = err?.code || '';
  const msg = err?.message || '';

  if (code === 'auth/operation-not-allowed') {
    return 'Google Sign-In is not enabled yet in your Firebase Console. Please go to Firebase Console → Authentication → Sign-in method, click Google, and enable it.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in popup was closed before completing. Please try again.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not in your Firebase Authorized Domains list. Please add localhost in Firebase Console → Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/invalid-api-key') {
    return 'Invalid Firebase API Key. Please check NEXT_PUBLIC_FIREBASE_API_KEY in .env.local.';
  }
  return msg || 'Registration failed. Please try again.';
}

export default function SignUpPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Toast state for Unauthorized Access
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    fetch('/api/teams')
      .then((res) => res.json())
      .then((data) => {
        if (data.teams) setTeams(data.teams);
      })
      .catch(() => { });
  }, []);

  async function handleGoogleSignUp() {
    setError('');
    setToast(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();

      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        await auth.signOut();

        if (res.status === 403) {
          setToast({
            title: 'Unauthorized Access',
            message:
              j.error ||
              'Your Google account is not on the administrator whitelist. Access has been denied and account purged.',
          });
          return;
        }

        throw new Error(
          j.error || 'Your Google account is not authorized by an administrator.'
        );
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setToast(null);
    setLoading(true);

    try {
      // 1. Create account on server
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, teamId }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setToast({
            title: 'Unauthorized Access',
            message:
              data.error ||
              'Your email is not on the administrator whitelist. Please request an administrator to whitelist you.',
          });
          return;
        }
        throw new Error(data.error || 'Failed to register');
      }

      // 2. Sign in client-side to get token & session cookie
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();

      const sessionRes = await fetch('/api/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!sessionRes.ok) {
        const j = await sessionRes.json().catch(() => ({}));
        await auth.signOut();

        if (sessionRes.status === 403) {
          setToast({
            title: 'Unauthorized Access',
            message:
              j.error ||
              'Your account is not on the administrator whitelist. Access denied.',
          });
          return;
        }

        throw new Error(j.error || 'Failed to create authenticated session');
      }

      // 3. Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] relative flex items-center justify-center px-4 py-6 sm:py-12 bg-[#09090b] text-[#e5e1e4] font-['Inter',sans-serif]">
      {/* Floating Unauthorized Toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] bg-[#18181b] border border-red-500/50 rounded-xl p-4 shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0 text-red-400 font-bold text-sm">
            !
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-red-400 tracking-wide uppercase">
              {toast.title}
            </h4>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-zinc-400 hover:text-white text-xs font-mono shrink-0 p-1"
          >
            ✕
          </button>
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-6 sm:p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c] ring-4 ring-[#ea580c]/20"></span>
              <span className="font-bold text-base text-white tracking-tight">FED KIIT</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Create Member Account</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">Join FED marketing attribution squad</p>
          </div>

          {/* Google Sign In/Up Button */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignUp}
            className="w-full min-h-[48px] mb-4 flex items-center justify-center gap-3 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-500 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-sm cursor-pointer active:scale-[0.99]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8 0-1.3.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-[#27272a] w-full"></div>
            <span className="bg-[#121214] px-3 text-xs text-zinc-500">
              or register with email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs sm:text-sm font-medium text-zinc-300">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                suppressHydrationWarning
                className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-all"
                placeholder="e.g. Aarav Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-zinc-300">
                Official Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                suppressHydrationWarning
                className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-all"
                placeholder="name@kiit.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                suppressHydrationWarning
                className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-all"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {teams.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-medium text-zinc-300">
                  Select Team (Optional)
                </label>
                <select
                  className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-all"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">Select a squad or assign later</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#121214] text-white">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-950/40 border border-red-500/30 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-[#ea580c] hover:bg-[#c2410c] active:scale-[0.99] py-3 text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-[#ea580c]/20 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Creating Account...</span>
                </>
              ) : (
                'Register Account'
              )}
            </button>
          </form>

          {/* Navigation link */}
          <div className="mt-5 text-center text-xs sm:text-sm text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-[#ea580c] hover:underline font-semibold ml-1">
              Sign in
            </Link>
          </div>

          <div className="mt-6 pt-4 border-t border-[#27272a] text-center">
            <a
              href="https://fedkiit.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors inline-flex items-center gap-1"
            >
              Visit Official Website (fedkiit.com) ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

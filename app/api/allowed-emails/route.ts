import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth';
import type { AllowedEmailRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/allowed-emails - List all whitelisted emails (Admin/Superadmin only)
export async function GET() {
  try {
    await requireAdmin();
    const snap = await db.ref('allowedEmails').get();
    const data = snap.val() ?? {};
    const allowedEmails: AllowedEmailRecord[] = Object.values(data);
    allowedEmails.sort((a, b) => b.addedAt - a.addedAt);
    return NextResponse.json({ allowedEmails });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch authorized emails';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/allowed-emails - Add single or multiple whitelisted emails
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const rawInput = body.emails;

    if (!rawInput) {
      return NextResponse.json({ error: 'No emails provided' }, { status: 400 });
    }

    // Support both string (pasted list) and array
    let rawList: string[] = [];
    if (Array.isArray(rawInput)) {
      rawList = rawInput;
    } else if (typeof rawInput === 'string') {
      // Split by commas, newlines, semicolons, or spaces
      rawList = rawInput.split(/[\n,;\s]+/);
    }

    // Normalize and filter valid emails
    const validEmails = Array.from(
      new Set(
        rawList
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0 && EMAIL_REGEX.test(e))
      )
    );

    if (validEmails.length === 0) {
      return NextResponse.json(
        { error: 'No valid email addresses found in the input.' },
        { status: 400 }
      );
    }

    // Get current whitelist to prevent duplicates
    const snap = await db.ref('allowedEmails').get();
    const existing = (snap.val() ?? {}) as Record<string, AllowedEmailRecord>;
    const existingEmails = new Set(
      Object.values(existing).map((r) => r.email.toLowerCase().trim())
    );

    let addedCount = 0;
    let duplicateCount = 0;

    for (const email of validEmails) {
      if (existingEmails.has(email)) {
        duplicateCount++;
        continue;
      }

      const id = `allow_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const record: AllowedEmailRecord = {
        id,
        email,
        addedBy: user.email,
        addedAt: Date.now(),
      };

      await db.ref(`allowedEmails/${id}`).set(record);
      existingEmails.add(email);
      addedCount++;
    }

    return NextResponse.json({
      success: true,
      addedCount,
      duplicateCount,
      totalProcessed: validEmails.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to authorize emails';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/allowed-emails - Remove an email from whitelist
export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const queryId = searchParams.get('id');

    let id = queryId;
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing email record id' }, { status: 400 });
    }

    await db.ref(`allowedEmails/${id}`).remove();
    return NextResponse.json({ success: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to remove email';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

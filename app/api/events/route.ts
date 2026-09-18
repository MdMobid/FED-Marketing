import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/firebase-admin';
import { requireAdmin, requireUser } from '@/lib/auth';
import { eventSchema } from '@/lib/validation';
import type { EventRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/events - List events
export async function GET() {
  try {
    const snap = await db.ref('events').get();
    const data = snap.val() ?? {};
    const events: EventRecord[] = Object.values(data);
    events.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ events });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

// POST /api/events - Create event (Admin/Superadmin only)
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const parsed = eventSchema.parse(body);

    const id = `event_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const newEvent: EventRecord = {
      id,
      title: parsed.title,
      description: parsed.description ?? '',
      active: parsed.active ?? true,
      formFields: parsed.formFields,
      createdAt: Date.now(),
      createdBy: user.email,
    };

    await db.ref(`events/${id}`).set(newEvent);
    return NextResponse.json({ success: true, event: newEvent });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create event';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

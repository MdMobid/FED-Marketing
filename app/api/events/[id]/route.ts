import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/auth';
import { eventSchema } from '@/lib/validation';
import type { EventRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/events/[id] - Fetch single event (Public for /scan page, or for dashboards)
export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const snap = await db.ref(`events/${id}`).get();
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = snap.val() as EventRecord;
    return NextResponse.json({ event });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to retrieve event' },
      { status: 500 }
    );
  }
}

// PATCH /api/events/[id] - Update event details or form fields (Admin/Superadmin only)
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const parsed = eventSchema.partial().parse(body);

    const ref = db.ref(`events/${id}`);
    const snap = await ref.get();
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const current = snap.val() as EventRecord;
    const updated: EventRecord = {
      ...current,
      ...parsed,
      formFields: parsed.formFields ?? current.formFields,
    };

    await ref.update(updated);
    return NextResponse.json({ success: true, event: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update event';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/events/[id] - Delete an event (Admin/Superadmin only)
export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    await db.ref(`events/${id}`).remove();
    return NextResponse.json({ success: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete event';
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

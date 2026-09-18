'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import type { FormField, QRCodeRecord, EventRecord } from '@/types';

function ScanForm() {
  const params = useSearchParams();
  const qrCodeId = params.get('qr') ?? '';

  const [qrData, setQrData] = useState<QRCodeRecord | null>(null);
  const [eventData, setEventData] = useState<EventRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadQrInfo() {
      if (!qrCodeId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/qr?id=${encodeURIComponent(qrCodeId)}`);
        const json = await res.json();
        if (res.ok && json.qr) {
          setQrData(json.qr);
          if (json.event) {
            setEventData(json.event);
            // Pre-initialize form fields
            const initialForm: Record<string, any> = {};
            json.event.formFields?.forEach((f: FormField) => {
              initialForm[f.id] = '';
            });
            setFormData(initialForm);
          }
        } else {
          setMessage(json.error || 'Invalid QR code');
        }
      } catch {
        setMessage('Failed to load event registration details');
      } finally {
        setLoading(false);
      }
    }
    loadQrInfo();
  }, [qrCodeId]);

  const handleFieldChange = (fieldId: string, val: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: val }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!qrCodeId) {
      setStatus('error');
      setMessage('Missing QR code identifier. Please scan a valid FED event QR code.');
      return;
    }

    setStatus('submitting');
    setMessage('Submitting your details...');

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCodeId,
          formData,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage('Your registration has been successfully recorded.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Submission failed. Please check your fields and try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  // Default fallback fields if no specific dynamic fields configured
  const defaultFields: FormField[] = [
    { id: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'e.g. Aarav Sharma' },
    { id: 'phone', label: 'Phone Number', type: 'phone', required: true, placeholder: '+91 98765 43210' },
    { id: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'aarav@kiit.ac.in' },
    { id: 'rollNo', label: 'Roll Number', type: 'text', required: false, placeholder: 'e.g. 2105490' },
  ];

  const activeFields: FormField[] =
    eventData?.formFields && eventData.formFields.length > 0
      ? eventData.formFields
      : defaultFields;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-6 sm:py-12 bg-[#09090b] text-[#e5e1e4] font-['Inter',sans-serif]">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl bg-[#121214] border border-[#27272a] p-5 sm:p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <Link href="/" className="inline-flex items-center gap-2 group">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c] ring-4 ring-[#ea580c]/20"></span>
                <span className="font-bold text-base text-white tracking-tight">FED KIIT</span>
              </Link>
              <span className="px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[11px] font-medium text-emerald-400">
                Official Event Form
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {eventData?.title || 'Event Registration'}
            </h1>
            {eventData?.description && (
              <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
                {eventData.description}
              </p>
            )}

            {/* Attribution Info Badge */}
            {qrData && (
              <div className="mt-4 p-3.5 rounded-xl bg-[#18181b] border border-[#27272a] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-zinc-500 block text-[10px] uppercase font-mono tracking-wider">
                    {qrData.type === 'team' ? 'Attributed Team' : 'Marketing Executive'}
                  </span>
                  <span className="text-sm font-semibold text-white truncate block">
                    {qrData.type === 'team'
                      ? qrData.teamName
                      : qrData.memberName || 'FED Member'}
                  </span>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-[#ea580c]/10 border border-[#ea580c]/20 text-[#ea580c] font-mono text-[11px] font-medium">
                  Verified Pass
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-zinc-400 text-xs font-mono flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[#ea580c] border-t-transparent rounded-full animate-spin"></div>
              <span>Loading event registration...</span>
            </div>
          ) : status === 'success' ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 text-3xl font-bold shadow-lg shadow-emerald-500/10">
                ✓
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">You&apos;re Registered!</h2>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-xs mx-auto mt-1 leading-relaxed">
                  {message}
                </p>
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStatus('idle');
                    setFormData({});
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-500 text-sm font-medium text-white transition-colors cursor-pointer"
                >
                  Submit Another Response
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeFields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs sm:text-sm text-zinc-300 font-medium">
                      {field.label}
                      {field.required && (
                        <span className="text-[#ea580c] font-bold ml-1">*</span>
                      )}
                    </label>
                    {!field.required && (
                      <span className="text-zinc-500 text-[11px]">Optional</span>
                    )}
                  </div>

                  {field.type === 'dropdown' ? (
                    <select
                      required={field.required}
                      className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-colors"
                      value={formData[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    >
                      <option value="" disabled>
                        {field.placeholder || `Select ${field.label}`}
                      </option>
                      {field.options?.map((opt, i) => (
                        <option key={i} value={opt} className="bg-[#121214] text-white">
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      required={field.required}
                      rows={3}
                      className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-colors resize-none"
                      placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                      value={formData[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    />
                  ) : (
                    <input
                      type={
                        field.type === 'email'
                          ? 'email'
                          : field.type === 'number'
                          ? 'number'
                          : field.type === 'phone'
                          ? 'tel'
                          : 'text'
                      }
                      required={field.required}
                      className="w-full rounded-xl bg-[#09090b] border border-[#27272a] px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c] focus:outline-none transition-colors"
                      placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                      value={formData[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    />
                  )}
                </div>
              ))}

              {status === 'error' && (
                <div className="rounded-xl bg-red-950/40 border border-red-500/30 p-3.5 text-xs text-red-300">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full min-h-[48px] mt-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] active:scale-[0.99] py-3 text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-lg shadow-[#ea580c]/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {status === 'submitting' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Submitting...</span>
                  </>
                ) : (
                  'Complete Registration'
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-[#27272a]/60 text-center text-xs text-zinc-500">
            Powered by FED KIIT Marketing Attribution Platform
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-zinc-500 text-xs font-mono">
          Loading registration portal...
        </div>
      }
    >
      <ScanForm />
    </Suspense>
  );
}

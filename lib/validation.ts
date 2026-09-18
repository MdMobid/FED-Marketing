import { z } from 'zod';

export const formFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  type: z.enum(['text', 'number', 'email', 'phone', 'dropdown', 'textarea']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim()).optional(),
  placeholder: z.string().trim().max(100).optional(),
});

export const eventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
  formFields: z.array(formFieldSchema).min(1, 'Event must have at least one form field'),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
});

export const memberCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  teamId: z.string().min(1, 'Team selection is required'),
  role: z.enum(['admin', 'member']).default('member'),
});

export const userRoleUpdateSchema = z.object({
  targetUid: z.string().min(1),
  role: z.enum(['superadmin', 'admin', 'member']),
  teamId: z.string().optional(),
});

export const dynamicSubmissionSchema = z.object({
  qrCodeId: z.string().min(1),
  formData: z.record(z.any()),
});

// Legacy schema for existing /api/leads backwards compatibility
export const leadSchema = z.object({
  qrCodeId: z.string().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/).optional(),
  email: z.string().trim().email().max(200).optional(),
  formData: z.record(z.any()).optional(),
});

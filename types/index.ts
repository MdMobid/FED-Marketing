export type Role = 'superadmin' | 'admin' | 'member';

export type QRType = 'member' | 'team';

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  teamId?: string;
  teamName?: string;
  active: boolean;
  createdAt: number;
  promotedBy?: string;
  promotedByName?: string;
};

export type FormFieldType = 'text' | 'number' | 'email' | 'phone' | 'dropdown' | 'textarea';

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
};

export type EventRecord = {
  id: string;
  title: string;
  description?: string;
  active: boolean;
  createdAt: number;
  formFields: FormField[];
  createdBy?: string;
};

export type TeamRecord = {
  id: string;
  name: string;
  description?: string;
  memberIds?: string[];
  createdAt: number;
  deleted?: boolean;
  deletedAt?: number;
};

export type QRCodeRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  type: QRType;
  teamId: string;
  teamName: string;
  memberId?: string;
  memberName?: string;
  teamMembers?: string[];
  active: boolean;
  createdAt: number;
};

export type Submission = {
  id: string;
  eventId: string;
  eventTitle: string;
  qrCodeId: string;
  teamId: string;
  teamName: string;
  memberId?: string;
  memberName?: string;
  teamMembers?: string[];
  formData: Record<string, any>;
  createdAt: number;
};

// Legacy Lead type for backwards compatibility
export type Lead = {
  id: string;
  qrCodeId: string;
  teamId: string;
  memberId: string;
  name: string;
  phone: string;
  email: string;
  createdAt: number;
  syncStatus?: 'pending' | 'synced' | 'failed';
  sheetRowKey?: string;
  syncAttempts?: number;
  lastSyncError?: string;
};

export type AllowedEmailRecord = {
  id: string;
  email: string;
  addedBy: string;
  addedAt: number;
};


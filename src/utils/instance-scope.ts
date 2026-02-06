export const LEGACY_INSTANCE_ID = 'legacy_unassigned';

export function normalizeInstanceId(instanceId?: string | null): string {
  const value = typeof instanceId === 'string' ? instanceId.trim() : '';
  return value || LEGACY_INSTANCE_ID;
}

export function normalizeChatIdentity(value?: string | null): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  let normalized = raw;

  // Scoped IDs are stored as: wa:<instance>::<chatIdentity>.
  const scopedSeparator = normalized.lastIndexOf('::');
  if (scopedSeparator >= 0) {
    normalized = normalized.slice(scopedSeparator + 2);
  }

  normalized = normalized.replace(/^waid?:/i, '');

  const atIndex = normalized.indexOf('@');
  let userPart = atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;

  // WhatsApp can emit device-suffixed IDs (e.g., 5511999999999:12@c.us).
  // Canonical identity must be stable across devices.
  userPart = userPart.replace(/:\d+$/g, '');

  return userPart.trim();
}

export function buildScopedLeadId(instanceId: string, chatOrPhone: string): string {
  const scope = normalizeInstanceId(instanceId);
  const identity = normalizeChatIdentity(chatOrPhone) || chatOrPhone;
  return `${scope}::${identity}`;
}

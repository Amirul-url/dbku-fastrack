import { getStoredUser } from "../services/api";

const ADMIN_APPROVAL_SEEN_KEY = "fastrack_admin_approval_seen_records";

function readLocalJson(key, fallback = {}) {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in some browser privacy modes.
  }
}

function getUserStorageKey(baseKey, user) {
  const userKey = String(user?.id || user?.pk || user?.username || user?.email || "anonymous")
    .trim()
    .toLowerCase();

  return `${baseKey}:${userKey || "anonymous"}`;
}

export function getAdminRecordUpdatedTime(record) {
  const value =
    record?.updated_at ||
    record?.updatedAt ||
    record?.modified_at ||
    record?.created_at;
  const time = Date.parse(value || "");

  return Number.isFinite(time) ? time : 0;
}

export function getAdminApprovalRecordSeen(user = getStoredUser()) {
  return readLocalJson(getUserStorageKey(ADMIN_APPROVAL_SEEN_KEY, user));
}

export function isAdminApprovalRecordUnread(record, seenAt = {}) {
  if (!record?.id) return false;

  const lastSeenAt = Number(seenAt[record.id] || 0);
  return lastSeenAt < getAdminRecordUpdatedTime(record);
}

export function markAdminApprovalRecordSeen(record, user = getStoredUser()) {
  if (!record?.id) return {};

  const storageKey = getUserStorageKey(ADMIN_APPROVAL_SEEN_KEY, user);
  const currentMap = readLocalJson(storageKey);
  const nextMap = {
    ...currentMap,
    [record.id]: Math.max(Date.now(), getAdminRecordUpdatedTime(record)),
  };

  writeLocalJson(storageKey, nextMap);
  window.dispatchEvent(new Event("fastrack:admin-approval-record-seen"));

  return nextMap;
}

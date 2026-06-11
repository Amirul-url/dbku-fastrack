import { getStoredUser } from "../services/api";

const APPLICANT_STATUS_SEEN_KEY = "fastrack_applicant_status_seen_records";
const APPLICANT_E_LICENSE_SEEN_KEY = "fastrack_applicant_e_license_seen_records";

function readLocalJson(key, fallback = {}) {
  try {
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

export function getRecordUpdatedTime(record) {
  const value =
    record?.updated_at ||
    record?.updatedAt ||
    record?.modified_at ||
    record?.created_at;
  const time = Date.parse(value || "");

  return Number.isFinite(time) ? time : 0;
}

export function getApplicantRecordSeen(user = getStoredUser()) {
  return {
    status: readLocalJson(getUserStorageKey(APPLICANT_STATUS_SEEN_KEY, user)),
    eLicense: readLocalJson(getUserStorageKey(APPLICANT_E_LICENSE_SEEN_KEY, user)),
  };
}

export function markApplicantRecordSeen(tab, record, user = getStoredUser()) {
  if (!record?.id) return {};

  const normalizedTab = tab === "license" ? "license" : "status";
  const storageKey = getUserStorageKey(
    normalizedTab === "license" ? APPLICANT_E_LICENSE_SEEN_KEY : APPLICANT_STATUS_SEEN_KEY,
    user
  );
  const currentMap = readLocalJson(storageKey);
  const nextMap = {
    ...currentMap,
    [record.id]: Math.max(Date.now(), getRecordUpdatedTime(record)),
  };

  writeLocalJson(storageKey, nextMap);
  window.dispatchEvent(new Event("fastrack:applicant-record-seen"));

  return nextMap;
}

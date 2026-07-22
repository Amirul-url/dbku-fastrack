import { getStoredUser } from "../services/api";

const APPLICANT_STATUS_SEEN_KEY = "fastrack_applicant_status_seen_records";
const APPLICANT_E_LICENSE_SEEN_KEY = "fastrack_applicant_e_license_seen_records";
const SEEN_TIMESTAMP_GRACE_MS = 5000;

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
  const values = [
    record?.updated_at,
    record?.updatedAt,
    record?.modified_at,
    record?.created_at,
    ...getLicenseRenewalTimestampValues(record),
  ];
  const time = Math.max(
    0,
    ...values.map((value) => {
      const parsed = Date.parse(value || "");
      return Number.isFinite(parsed) ? parsed : 0;
    })
  );

  return Number.isFinite(time) ? time : 0;
}

function getLicenseRenewalTimestampValues(record) {
  const renewal = record?.form_data?.license_renewal || record?.license_renewal || {};
  const reminders = renewal?.reminders || {};
  const values = [];

  if (Array.isArray(renewal?.early_payment_receipts)) {
    renewal.early_payment_receipts.forEach((receipt) => {
      values.push(receipt?.uploaded_at);
    });
  }

  if (reminders && typeof reminders === "object") {
    Object.values(reminders).forEach((reminder) => {
      const letter = reminder?.letter || {};
      values.push(
        reminder?.confirmed_at,
        reminder?.generated_at,
        letter?.generated_at,
        letter?.confirmed_at,
        letter?.released_at
      );

      if (Array.isArray(reminder?.early_payment_receipts)) {
        reminder.early_payment_receipts.forEach((receipt) => {
          values.push(receipt?.uploaded_at);
        });
      }
    });
  }

  return values.filter(Boolean);
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
    [record.id]: Math.max(Date.now() + SEEN_TIMESTAMP_GRACE_MS, getRecordUpdatedTime(record)),
  };

  writeLocalJson(storageKey, nextMap);
  window.dispatchEvent(new Event("fastrack:applicant-record-seen"));

  return nextMap;
}

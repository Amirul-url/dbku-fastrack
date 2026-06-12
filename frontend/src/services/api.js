function getDefaultApiUrl() {
  try {
    if (window.location.hostname === "fastrack.sapotlokal.my") {
      return "https://t13ibowgmqv1q5b97ctxtd3t.sapotlokal.my/api";
    }
  } catch {
    // Vite runs this module in the browser; keep a safe fallback for tooling.
  }

  return "http://127.0.0.1:8000/api";
}

const RAW_API_URL =
  import.meta.env.VITE_API_URL || getDefaultApiUrl();
const API_URL = String(RAW_API_URL).replace(/\/+$/, "");
const LOCAL_FILE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const SIDEBAR_SESSION_KEYS = [
  "fastrack_admin_dashboard_menu_open",
  "fastrack_admin_e_licenses_menu_open",
  "fastrack_admin_applications_menu_open",
];
let refreshTokenPromise = null;

function clearSidebarSessionState() {
  try {
    SIDEBAR_SESSION_KEYS.forEach((key) => {
      window.sessionStorage.removeItem(key);
    });
  } catch {
    // Session storage can be unavailable in some browser privacy modes.
  }
}

function getApiOrigin() {
  try {
    return new URL(API_URL, window.location.origin).origin;
  } catch {
    return "";
  }
}

function getRequestUrl(path) {
  return `${API_URL}${path}`;
}

function getRequestPathFromApiUrl(url) {
  try {
    const apiUrl = new URL(API_URL, window.location.origin);
    const parsed = new URL(url, apiUrl.origin);
    const apiPath = apiUrl.pathname.replace(/\/+$/, "");
    let path = `${parsed.pathname}${parsed.search}`;

    if (apiPath && path.startsWith(`${apiPath}/`)) {
      path = path.slice(apiPath.length);
    }

    return path || "/";
  } catch {
    return "";
  }
}

function getPathWithQuery(path, params = {}) {
  const [basePath, rawQuery = ""] = String(path || "").split("?");
  const query = new URLSearchParams(rawQuery);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      if (value.length > 0) query.set(key, value.join(","));
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function isLocalHostName(hostname = "") {
  const normalized = hostname.toLowerCase();

  return LOCAL_FILE_HOSTS.has(normalized) || normalized === "localhost";
}

function getCurrentHostName() {
  try {
    return window.location.hostname;
  } catch {
    return "";
  }
}

function createNetworkError(path, cause) {
  const requestUrl = getRequestUrl(path);
  let message =
    "Cannot reach the backend API. Please check that the backend service is running and accessible.";

  try {
    const target = new URL(requestUrl, window.location.origin);
    const frontendHost = getCurrentHostName();
    const isFrontendRemote = frontendHost && !isLocalHostName(frontendHost);

    if (isFrontendRemote && isLocalHostName(target.hostname)) {
      message = `Cannot reach the backend API at ${target.origin}. The frontend is configured to use a localhost API URL, so this deployed site is trying to call the visitor's own computer. Set VITE_API_URL in Coolify to your backend public URL ending with /api, then redeploy the frontend.`;
    } else {
      message = `Cannot reach the backend API at ${target.origin}. Check that the backend is online, the URL is correct, HTTPS is valid, and CORS allows this frontend domain.`;
    }
  } catch {
    message = `Cannot reach the backend API. Check VITE_API_URL and confirm the backend service is online.`;
  }

  const error = new Error(message);
  error.name = "ApiNetworkError";
  error.isNetworkError = true;
  error.requestUrl = requestUrl;
  error.apiUrl = API_URL;
  error.cause = cause;
  return error;
}

function extractApiErrorMessage(data, status) {
  if (!data || typeof data !== "object") {
    return `Request failed (${status})`;
  }

  const directMessage =
    data.error ||
    data.detail ||
    data.message ||
    data.non_field_errors?.[0];

  if (directMessage) return directMessage;

  const firstFieldError = Object.entries(data).find(([, value]) => {
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  if (firstFieldError) {
    const [field, value] = firstFieldError;
    const message = Array.isArray(value) ? value[0] : value;
    const label = field.replaceAll("_", " ");

    return `${label}: ${message}`;
  }

  return `Request failed (${status})`;
}

export function getApiUrl(path) {
  if (!path || typeof path !== "string") return "";
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${API_URL}${normalizedPath}`;
}

export function getApplicationDocumentUrl(applicationId, documentId) {
  if (!applicationId || !documentId) return "";

  return getApiUrl(
    `/applications/${applicationId}/documents/${documentId}/download/`
  );
}

export async function deleteApplicationDocument(applicationId, documentId) {
  if (!applicationId || !documentId) return;

  await apiRequest(`/applications/${applicationId}/documents/${documentId}/`, {
    method: "DELETE",
  });
}

export function getApplicationSiteImageUrl(applicationId) {
  if (!applicationId) return "";

  return getApiUrl(`/applications/${applicationId}/site-image/download/`);
}

export function getSiteImageUrl(applicationId, savedSiteImage, stepData = {}) {
  const documentId =
    savedSiteImage?.document_id ||
    savedSiteImage?.id ||
    stepData.site_image_document_id;

  if (documentId) {
    return getApplicationDocumentUrl(applicationId, documentId);
  }

  const documentUrl = getApplicationSiteImageUrl(applicationId);

  if (documentUrl) return documentUrl;

  return normalizeFileUrl(
    savedSiteImage?.url ||
      savedSiteImage?.file_url ||
      savedSiteImage?.file ||
      stepData.site_image_url ||
      stepData.site_image_preview ||
      ""
  );
}

function isInternalFileHost(hostname = "") {
  const normalized = hostname.toLowerCase();

  return (
    LOCAL_FILE_HOSTS.has(normalized) ||
    normalized === "backend" ||
    normalized.endsWith(".internal")
  );
}

export function normalizeFileUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;

  const apiOrigin = getApiOrigin();

  if (!apiOrigin) return url;

  try {
    const parsed = new URL(url, apiOrigin);

    if (parsed.pathname.startsWith("/media/")) {
      const apiUrl = new URL(apiOrigin);
      const shouldUseApiOrigin =
        url.startsWith("/") ||
        isInternalFileHost(parsed.hostname) ||
        parsed.hostname !== apiUrl.hostname;

      if (shouldUseApiOrigin) {
        return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    }

    return parsed.href;
  } catch {
    return url;
  }
}

export async function fetchAuthenticatedBlob(url) {
  let token = localStorage.getItem("fastrack_access_token");

  const makeRequest = async (accessToken) =>
    fetch(url, {
      headers: {
        ...(accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {}),
      },
    });

  let response = await makeRequest(token);

  if (response.status === 401 && token) {
    const newAccessToken = await refreshAccessToken();

    if (!newAccessToken) {
      if (!hasRefreshToken()) {
        window.location.href = "/login/malaysian";
      }
      throw new Error("Session expired");
    }

    response = await makeRequest(newAccessToken);
  }

  if (!response.ok) {
    throw new Error(`File request failed (${response.status})`);
  }

  return response.blob();
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("fastrack_user") || "null");
  } catch {
    return null;
  }
}

export function getNormalizedRole(user) {
  const role = String(user?.role || "").toLowerCase();

  if (role === "superadmin") {
    return "superadmin";
  }

  if (
    role === "admin" ||
    role === "supervisor" ||
    role === "staff" ||
    user?.is_staff ||
    user?.is_superuser
  ) {
    return "admin";
  }

  if (role === "applicant" || role === "user") {
    return "applicant";
  }

  return "";
}

export function isSuperAdminUser(user) {
  return getNormalizedRole(user) === "superadmin";
}

export function isAdminUser(user) {
  return getNormalizedRole(user) === "admin";
}

export function isApplicantUser(user) {
  return getNormalizedRole(user) === "applicant";
}

export function getUserRedirectPath(user) {
  if (isSuperAdminUser(user)) {
    return "/superadmin/dashboard";
  }

  if (isAdminUser(user)) {
    return "/dashboard/admin";
  }

  if (isApplicantUser(user)) {
    return "/user/dashboard";
  }

  return "/login/malaysian";
}

function normalizeStoredFullName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function saveAuthSession(data, rememberMe = false) {
  clearSidebarSessionState();

  if (data?.access) {
    localStorage.setItem("fastrack_access_token", data.access);
  }

  if (data?.refresh) {
    localStorage.setItem("fastrack_refresh_token", data.refresh);
  }

  if (data?.user) {
    localStorage.setItem(
      "fastrack_user",
      JSON.stringify({
        ...data.user,
        full_name: normalizeStoredFullName(data.user.full_name),
        role: data.user.role || getNormalizedRole(data.user),
      })
    );
  }

  if (data?.login_session_id) {
    localStorage.setItem("fastrack_login_session_id", String(data.login_session_id));
  }

  localStorage.setItem("fastrack_remember_me", rememberMe ? "true" : "false");
  window.dispatchEvent(new Event("fastrack:auth-changed"));
}

export function clearAuthSession() {
  localStorage.removeItem("fastrack_access_token");
  localStorage.removeItem("fastrack_refresh_token");
  localStorage.removeItem("fastrack_user");
  localStorage.removeItem("fastrack_remember_me");
  localStorage.removeItem("fastrack_login_session_id");
  clearSidebarSessionState();
  window.dispatchEvent(new Event("fastrack:auth-changed"));
}

export async function recordLogoutSession() {
  const sessionId = localStorage.getItem("fastrack_login_session_id");
  if (!localStorage.getItem("fastrack_access_token")) return;

  try {
    await apiRequest("/auth/logout/", {
      method: "POST",
      body: JSON.stringify({
        login_session_id: sessionId || undefined,
      }),
    });
  } catch (error) {
    console.error("Logout session recording failed:", error);
  }
}

export function getAccessTokenExpiryMs() {
  const token = localStorage.getItem("fastrack_access_token");
  if (!token) return 0;

  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return Number(payload.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

export function hasRefreshToken() {
  return Boolean(localStorage.getItem("fastrack_refresh_token"));
}

async function requestAccessTokenRefresh() {
  const refresh = localStorage.getItem("fastrack_refresh_token");

  if (!refresh) {
    clearAuthSession();
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/token/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh,
      }),
    });

    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) {
        clearAuthSession();
      }
      return null;
    }

    const data = await response.json();

    if (data?.access) {
      localStorage.setItem("fastrack_access_token", data.access);
      return data.access;
    }

    clearAuthSession();
    return null;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
}

export async function refreshAccessToken() {
  if (!refreshTokenPromise) {
    refreshTokenPromise = requestAccessTokenRefresh().finally(() => {
      refreshTokenPromise = null;
    });
  }

  return refreshTokenPromise;
}

export async function apiRequest(path, options = {}) {
  const isPublicAuthRequest =
    path.startsWith("/auth/login/") ||
    path.startsWith("/auth/register/") ||
    path.startsWith("/auth/password-reset/") ||
    path.startsWith("/token/");
  let token = isPublicAuthRequest
    ? null
    : localStorage.getItem("fastrack_access_token");

  const isFormData = options.body instanceof FormData;
  const canRefreshAuth = Boolean(token) && !isPublicAuthRequest;

  const makeRequest = async (accessToken) => {
    return fetch(getRequestUrl(path), {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {}),
        ...(options.headers || {}),
      },
    });
  };

  let response;

  try {
    response = await makeRequest(token);
  } catch (error) {
    throw createNetworkError(path, error);
  }

  if (response.status === 401 && canRefreshAuth) {
    const newAccessToken = await refreshAccessToken();

    if (!newAccessToken) {
      if (!hasRefreshToken()) {
        window.location.href = "/login/malaysian";
      }
      throw new Error("Session expired");
    }

    try {
      response = await makeRequest(newAccessToken);
    } catch (error) {
      throw createNetworkError(path, error);
    }
  }

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(extractApiErrorMessage(data, response.status));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && path.startsWith("/applications")) {
    window.dispatchEvent(new Event("fastrack:applications-changed"));
  }

  return data;
}

export async function fetchPaginatedList(path, { params = {}, pageSize = 200, maxPages = 25 } = {}) {
  const results = [];
  let nextPath = getPathWithQuery(path, {
    ...params,
    page_size: pageSize,
  });
  let pageCount = 0;
  let totalCount = null;

  while (nextPath && pageCount < maxPages) {
    const data = await apiRequest(nextPath);

    if (Array.isArray(data)) {
      results.push(...data);
      return { results, count: results.length, next: null };
    }

    const pageResults = Array.isArray(data?.results) ? data.results : [];
    results.push(...pageResults);
    totalCount = Number.isFinite(Number(data?.count)) ? Number(data.count) : totalCount;
    nextPath = data?.next ? getRequestPathFromApiUrl(data.next) : "";
    pageCount += 1;
  }

  return {
    results,
    count: totalCount ?? results.length,
    next: nextPath || null,
  };
}

export async function fetchApplicationList(options = {}) {
  const data = await fetchPaginatedList("/applications/", options);
  return data.results;
}

export async function fetchPublicLicenseVerification(licenseId) {
  const encodedLicenseId = encodeURIComponent(String(licenseId || "").trim());
  if (!encodedLicenseId) {
    throw new Error("License ID is required.");
  }

  return apiRequest(`/applications/license-verification/${encodedLicenseId}/`);
}

export async function uploadApplicationDocument(applicationId, title, file) {
  const body = new FormData();
  body.append("title", title || file.name || "Document");
  body.append("file", file);

  const document = await apiRequest(
    `/applications/${applicationId}/upload_document/`,
    {
      method: "POST",
      body,
    }
  );

  return {
    document_id: document.id,
    title: document.title,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    url:
      getApplicationDocumentUrl(applicationId, document.id) ||
      normalizeFileUrl(document.file_url || document.file),
    file_url: normalizeFileUrl(document.file_url),
    file: document.file,
    uploaded_at: document.uploaded_at,
  };
}

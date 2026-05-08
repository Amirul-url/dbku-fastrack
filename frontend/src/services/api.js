const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("fastrack_user") || "null");
  } catch {
    return null;
  }
}

export function getNormalizedRole(user) {
  const role = String(user?.role || "").toLowerCase();

  if (role === "admin" || role === "staff" || user?.is_staff || user?.is_superuser) {
    return "admin";
  }

  if (role === "applicant" || role === "user") {
    return "applicant";
  }

  return "";
}

export function isAdminUser(user) {
  return getNormalizedRole(user) === "admin";
}

export function isApplicantUser(user) {
  return getNormalizedRole(user) === "applicant";
}

export function getUserRedirectPath(user) {
  if (isAdminUser(user)) {
    return "/dashboard/admin";
  }

  if (isApplicantUser(user)) {
    return "/user/dashboard";
  }

  return "/login/malaysian";
}

export function saveAuthSession(data, rememberMe = false) {
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
        role: getNormalizedRole(data.user) || data.user.role,
      })
    );
  }

  localStorage.setItem("fastrack_remember_me", rememberMe ? "true" : "false");
}

export function clearAuthSession() {
  localStorage.removeItem("fastrack_access_token");
  localStorage.removeItem("fastrack_refresh_token");
  localStorage.removeItem("fastrack_user");
  localStorage.removeItem("fastrack_remember_me");
}

async function refreshAccessToken() {
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
      clearAuthSession();
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
    clearAuthSession();
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  let token = localStorage.getItem("fastrack_access_token");

  const isFormData = options.body instanceof FormData;

  const makeRequest = async (accessToken) => {
    return fetch(`${API_URL}${path}`, {
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

  let response = await makeRequest(token);

  if (response.status === 401) {
    const newAccessToken = await refreshAccessToken();

    if (!newAccessToken) {
      window.location.href = "/login/malaysian";
      throw new Error("Session expired");
    }

    response = await makeRequest(newAccessToken);
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.detail ||
      data?.message ||
      data?.non_field_errors?.[0] ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}

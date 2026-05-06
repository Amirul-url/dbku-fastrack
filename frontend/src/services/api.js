const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("fastrack_user") || "null");
  } catch {
    return null;
  }
}

export function getUserRedirectPath(user) {
  const role = String(user?.role || "").toLowerCase();

  if (role === "admin" || role === "staff") {
    return "/dashboard/admin";
  }

  return "/user/dashboard";
}

export function saveAuthSession(data, rememberMe = false) {
  if (data?.access) {
    localStorage.setItem("fastrack_access_token", data.access);
  }

  if (data?.refresh) {
    localStorage.setItem("fastrack_refresh_token", data.refresh);
  }

  if (data?.user) {
    localStorage.setItem("fastrack_user", JSON.stringify(data.user));
  }

  localStorage.setItem("fastrack_remember_me", rememberMe ? "true" : "false");
}

export function clearAuthSession() {
  localStorage.removeItem("fastrack_access_token");
  localStorage.removeItem("fastrack_refresh_token");
  localStorage.removeItem("fastrack_user");
  localStorage.removeItem("fastrack_remember_me");
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("fastrack_access_token");

  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.error ||
      data.detail ||
      data.message ||
      data.non_field_errors?.[0] ||
      "Request failed";

    throw new Error(message);
  }

  return data;
}
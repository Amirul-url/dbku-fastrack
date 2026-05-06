import { useState } from "react";
import AuthLayout from "../../layout/AuthLayout";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest, getUserRedirectPath, saveAuthSession } from "../../services/api";

function LoginMalaysian() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter IC Number and password.");
      return;
    }

    try {
      setLoading(true);

      const data = await apiRequest("/auth/login/", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      saveAuthSession(data, rememberMe);
      navigate(getUserRedirectPath(data.user), { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Please check your IC Number and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUsername("");
    setPassword("");
    setRememberMe(false);
    setError("");
  };

  return (
    <AuthLayout>
      <div className="mb-10">
        <h2 className="text-3xl font-bold text-[#1a1c1c]">Sign In</h2>
        <p className="text-base text-[#3d4a3d] mt-2">
          Access your personal dashboard and services.
        </p>
      </div>

      <div className="flex border-b border-[#bbcbba] mb-8">
        <Link
          to="/login/malaysian"
          className="px-6 py-3 text-sm font-semibold border-b-2 border-[#006d32] text-[#006d32]"
        >
          Malaysian
        </Link>

        <Link
          to="/login/non-malaysian"
          className="px-6 py-3 text-sm font-semibold border-b-2 border-transparent text-[#6c7b6c]"
        >
          Non-Malaysian
        </Link>
      </div>

      {error && (
        <div className="mb-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form className="space-y-6" onSubmit={handleLogin}>
        <div>
          <label className="block text-sm font-semibold text-[#3d4a3d] mb-1">
            IC Number
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7b6c]">
              badge
            </span>
            <input
              type="text"
              placeholder="000000-00-0000"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#f3f3f4] border border-[#bbcbba] rounded focus:ring-2 focus:ring-[#006d32] focus:border-[#006d32] outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#3d4a3d] mb-1">
            Password
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7b6c]">
              lock
            </span>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-[#f3f3f4] border border-[#bbcbba] rounded focus:ring-2 focus:ring-[#006d32] focus:border-[#006d32] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#6c7b6c]"
            >
              {showPassword ? "visibility_off" : "visibility"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-[#006d32] border-[#bbcbba] rounded"
            />
            <span className="text-sm text-[#3d4a3d]">Remember me</span>
          </label>

          <a href="#" className="text-sm text-[#006d32] font-semibold hover:underline">
            Forgot Password?
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="py-3 px-4 border border-[#006d32] text-[#006d32] text-sm font-semibold rounded hover:bg-[#eeeeee] disabled:opacity-60"
          >
            Reset
          </button>

          <button
            type="submit"
            disabled={loading}
            className="py-3 px-4 bg-[#006d32] text-white text-sm font-semibold rounded hover:bg-[#005224] disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>

      <p className="text-center mt-12 text-sm text-[#3d4a3d]">
        Don&apos;t have an account?{" "}
        <Link
          to="/register/malaysian"
          className="text-[#006d32] font-bold hover:underline"
        >
          Register Now
        </Link>
      </p>
    </AuthLayout>
  );
}

export default LoginMalaysian;
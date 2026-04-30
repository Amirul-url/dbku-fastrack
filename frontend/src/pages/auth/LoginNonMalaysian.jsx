import AuthLayout from "../../layout/AuthLayout";
import { Link, useNavigate } from "react-router-dom";

function LoginNonMalaysian() {
  const navigate = useNavigate();

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
          className="px-6 py-3 text-sm font-semibold border-b-2 border-transparent text-[#6c7b6c]"
        >
          Malaysian
        </Link>

        <Link
          to="/login/non-malaysian"
          className="px-6 py-3 text-sm font-semibold border-b-2 border-[#006d32] text-[#006d32]"
        >
          Non-Malaysian
        </Link>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          navigate("/home");
        }}
      >
        <div>
          <label className="block text-sm font-semibold text-[#3d4a3d] mb-1">
            Email Address
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7b6c]">
              mail
            </span>
            <input
              type="email"
              placeholder="e.g. name@example.com"
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
              type="password"
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-3 bg-[#f3f3f4] border border-[#bbcbba] rounded focus:ring-2 focus:ring-[#006d32] focus:border-[#006d32] outline-none"
            />
            <button
              type="button"
              className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#6c7b6c]"
            >
              visibility
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 text-[#006d32] rounded" />
            <span className="text-sm text-[#3d4a3d]">Remember me</span>
          </label>

          <a href="#" className="text-sm text-[#006d32] font-semibold hover:underline">
            Forgot Password?
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            type="button"
            className="py-3 px-4 border border-[#006d32] text-[#006d32] text-sm font-semibold rounded hover:bg-[#eeeeee]"
          >
            Reset
          </button>

          <button
            type="submit"
            className="py-3 px-4 bg-[#006d32] text-white text-sm font-semibold rounded hover:bg-[#005224]"
          >
            Sign in
          </button>
        </div>
      </form>

      <p className="text-center mt-12 text-sm text-[#3d4a3d]">
        Don&apos;t have an account?{" "}
        <Link
          to="/register/non-malaysian"
          className="text-[#006d32] font-bold hover:underline"
        >
          Register Now
        </Link>
      </p>
    </AuthLayout>
  );
}

export default LoginNonMalaysian;
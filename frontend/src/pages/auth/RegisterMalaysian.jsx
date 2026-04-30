import TopBar from "../../layout/TopBar";
import { Link } from "react-router-dom";

function RegisterMalaysian() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f9] text-slate-900">
      <TopBar />

      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-2">Account Registration</h1>
          <p className="text-slate-600 max-w-2xl">
            Complete the form below to create your account. Ensure all
            information matches your official identification documents.
          </p>
        </div>

        <form className="space-y-8">
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="h-1 bg-[#07c25f]" />

            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  person
                </span>
                <h2 className="text-2xl font-semibold">
                  Personal Information
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    Full Name (as per MyKad/Passport)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your full legal name"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Nationality
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      className="flex-1 py-2 text-sm font-semibold rounded bg-white shadow-sm text-[#006d32]"
                    >
                      Malaysian
                    </button>

                    <Link
                      to="/register/non-malaysian"
                      className="flex-1 py-2 text-sm font-semibold text-slate-500 text-center"
                    >
                      Non-Malaysian
                    </Link>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    MyKad Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 900101135555"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
                    Enter without dashes
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  contact_mail
                </span>
                <h2 className="text-2xl font-semibold">Contact Details</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Mobile Number
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 bg-slate-100 border border-r-0 border-slate-200 text-slate-500 rounded-l-lg text-sm">
                      +60
                    </span>
                    <input
                      type="tel"
                      placeholder="123456789"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-r-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="example@email.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    Residential Address
                  </label>
                  <textarea
                    rows="4"
                    placeholder="Enter your full correspondence address"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  security
                </span>
                <h2 className="text-2xl font-semibold">Account Security</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Retype Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="bg-yellow-50 border border-yellow-300 p-4 rounded-lg mb-4">
                    <div className="flex gap-3">
                      <span className="material-symbols-outlined text-yellow-700">
                        info
                      </span>
                      <p className="text-sm text-yellow-700">
                        The 'Secure Word' is used to verify the authenticity of
                        the portal during login. Never enter your password if
                        the secure word displayed does not match.
                      </p>
                    </div>
                  </div>

                  <label className="block text-sm font-semibold mb-2">
                    Secure Word
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BlueSky2024"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>
              </div>
            </div>
          </section>

          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input type="checkbox" className="mt-1" />
            <span>
              I have agreed to the{" "}
              <a href="#" className="text-[#006d32] font-semibold underline">
                Terms and Conditions
              </a>{" "}
              and{" "}
              <a href="#" className="text-[#006d32] font-semibold underline">
                Privacy Policy
              </a>{" "}
              governing the use of DBKU Portal.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="submit"
              className="flex-1 py-4 bg-[#07c25f] text-white rounded-lg font-bold hover:bg-[#006d32]"
            >
              Submit Registration
            </button>

            <Link
              to="/login/malaysian"
              className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 text-center"
            >
              Back to Login
            </Link>
          </div>
        </form>
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between gap-4 text-sm text-slate-500">
          <div>
            <p className="font-bold text-slate-700">DBKU Portal</p>
            <p>© 2026 Sarawak Government. All Rights Reserved.</p>
          </div>

          <div className="flex gap-6">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">FAQ</a>
            <a href="#">Contact Us</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RegisterMalaysian;
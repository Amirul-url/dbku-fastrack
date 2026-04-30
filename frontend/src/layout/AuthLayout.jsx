import TopBar from "./TopBar";
import logo from "../assets/logo-dbku.png";

function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f9]">
      <TopBar />

      <main className="flex flex-1 flex-col md:flex-row">

        {/* LEFT PANEL */}
        <section className="hidden md:flex md:w-1/2 relative bg-gradient-to-br from-emerald-700 to-emerald-900">
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e"
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          </div>

          <div className="relative z-10 p-12 flex flex-col justify-end text-white">
            <h1 className="text-4xl font-bold mb-4">
              DBKU fasTrack
            </h1>

            <p className="text-lg opacity-90">
              Integrated Advertisement License Management System
            </p>

            <p className="text-sm opacity-75 mt-3">
              Managed by Information and Communication Technology (ICT)
            </p>
          </div>
        </section>

        {/* RIGHT PANEL */}
        <section className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-md">

            {/* 🔥 LOGO ATAS FORM */}
            <div className="flex flex-col items-center mb-6">
              <img
                src={logo}
                alt="DBKU Logo"
                className="h-16 mb-2"
              />
              <p className="text-sm text-slate-500">
                fasTrack
              </p>
            </div>

            {children}

          </div>
        </section>

      </main>
    </div>
  );
}

export default AuthLayout;
import logo from "../assets/logo-dbku.png";

function TopBar() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="flex justify-between items-center h-16 px-6 w-full">

        {/* LEFT - LOGO IMAGE */}
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="DBKU Logo"
            className="h-10 w-auto object-contain"
          />

          <div>
            <p className="font-bold text-slate-900 leading-none">
              DBKU
            </p>
            <p className="text-xs text-slate-500 leading-none">
              fasTrack System
            </p>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-5">
          <span className="material-symbols-outlined text-slate-600">
            language
          </span>
          <span className="material-symbols-outlined text-slate-600">
            help_outline
          </span>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
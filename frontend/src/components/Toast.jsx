import { useEffect } from "react";

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  let style = "bg-green-600 text-white";
  let icon = "check_circle";

  if (type === "error") {
    style = "bg-red-600 text-white";
    icon = "error";
  }

  if (type === "warning") {
    style = "bg-yellow-500 text-white";
    icon = "warning";
  }

  return (
    <div className="fixed top-5 right-5 z-[999] animate-slide-in">
      <div
        className={`flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg ${style}`}
      >
        <span className="material-symbols-outlined">{icon}</span>
        <p className="font-semibold">{message}</p>
      </div>
    </div>
  );
}

export default Toast;
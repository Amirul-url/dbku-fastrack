import { useState } from "react";

function useToast() {
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  function hideToast() {
    setToast(null);
  }

  return {
    toast,
    showToast,
    hideToast,
  };
}

export default useToast;
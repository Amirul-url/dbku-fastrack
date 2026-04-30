import { createContext, useContext, useState } from "react";

const NotificationContext = createContext();

const initialNotifications = [
  {
    id: 1,
    title: "Application Approved",
    message: "FT-2026-0002 has been approved and is waiting for payment.",
    time: "2 mins ago",
    type: "success",
    read: false,
    category: "system",
  },
  {
    id: 2,
    title: "Payment Pending",
    message: "FT-2026-0005 is waiting for applicant payment confirmation.",
    time: "10 mins ago",
    type: "warning",
    read: false,
    category: "payment",
  },
  {
    id: 3,
    title: "SLA Warning",
    message: "FT-2026-0001 technical review is close to SLA limit.",
    time: "35 mins ago",
    type: "warning",
    read: true,
    category: "system",
  },
  {
    id: 4,
    title: "License Expired",
    message: "LIC-2026-0003 has expired and requires enforcement attention.",
    time: "1 hour ago",
    type: "error",
    read: false,
    category: "enforcement",
  },
];

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(initialNotifications);

  function markAsRead(id) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function markAllAsRead() {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true }))
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        markAsRead,
        markAllAsRead,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
import { useMemo, useState } from "react";
import AppShell from "../../layout/AppShell";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import { useNotifications } from "../../context/NotificationContext";
import {
  Alert,
  LinkButton,
  StatusPill,
} from "../../components/ui/SystemUI";
import { isAdminUser, isSuperAdminUser, getStoredUser } from "../../services/api";
import { formatDateTime } from "../../utils/workflow";

const filters = [
  { value: "all", labelKey: "notifications.filter.all", fallback: "All" },
  { value: "unread", labelKey: "notifications.filter.unread", fallback: "Unread" },
  { value: "account", labelKey: "notifications.filter.account", fallback: "Account" },
  { value: "submission", labelKey: "notifications.filter.submission", fallback: "Submission" },
  { value: "screening", labelKey: "notifications.filter.screening", fallback: "Screening" },
  { value: "technical", labelKey: "notifications.filter.technical", fallback: "Technical" },
  { value: "approval", labelKey: "notifications.filter.approval", fallback: "Approval" },
  { value: "payment", labelKey: "notifications.filter.payment", fallback: "Payment" },
  { value: "license", labelKey: "notifications.filter.license", fallback: "License" },
  { value: "correction", labelKey: "notifications.filter.correction", fallback: "Correction" },
  { value: "decision", labelKey: "notifications.filter.decision", fallback: "Decision" },
  { value: "progress", labelKey: "notifications.filter.progress", fallback: "Progress" },
];

const typeStyles = {
  success: {
    icon: "check_circle",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  warning: {
    icon: "priority_high",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  error: {
    icon: "error",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  info: {
    icon: "notifications_active",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

function getLocalized(item, field, language) {
  if (language === "ms") return item[`${field}Ms`] || item[field] || "";
  return item[`${field}En`] || item[field] || "";
}

function getMemoBodyParts(body) {
  const text = String(body || "").trim();
  const remarkMatch = text.match(/^(.*?)(?:\s+Remark:\s*)(.+)$/is);

  if (!remarkMatch) {
    return {
      lines: text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      remark: "",
    };
  }

  return {
    lines: remarkMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    remark: remarkMatch[2].trim(),
  };
}

function sanitizeMemoHtml(html) {
  const source = String(html || "").trim();
  if (!source || typeof window === "undefined" || !window.DOMParser) return "";

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const allowedTags = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FIGURE", "H1", "H2", "H3",
    "I", "LI", "OL", "P", "SPAN", "STRONG", "TABLE", "TBODY", "TD", "TH",
    "THEAD", "TR", "U", "UL",
  ]);
  const allowedAttributes = new Set(["colspan", "rowspan", "style", "href", "target", "rel", "class"]);
  const allowedStyleProperties = new Set([
    "border",
    "border-bottom",
    "border-collapse",
    "border-top",
    "background-color",
    "font-size",
    "margin-left",
    "margin-right",
    "padding",
    "text-align",
    "width",
  ]);

  document.body.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";

      if (!allowedAttributes.has(name) || /^on/i.test(name) || /javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.hasAttribute("style")) {
      const safeStyle = String(element.getAttribute("style") || "")
        .split(";")
        .map((rule) => rule.trim())
        .filter((rule) => {
          const [property, ...valueParts] = rule.split(":");
          const value = valueParts.join(":").trim();
          return (
            allowedStyleProperties.has(String(property || "").trim().toLowerCase()) &&
            value &&
            !/url|expression|javascript/i.test(value)
          );
        })
        .join("; ");

      if (safeStyle) {
        element.setAttribute("style", safeStyle);
      } else {
        element.removeAttribute("style");
      }
    }

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    }
  });

  return document.body.innerHTML;
}

function getMemoContentHtml(html) {
  const source = sanitizeMemoHtml(html);
  if (!source || typeof window === "undefined" || !window.DOMParser) return source;

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const firstHeading = document.body.querySelector("h1, h2, h3");
  const headingText = String(firstHeading?.textContent || "").replace(/\s+/g, " ").trim().toUpperCase();

  if (headingText.includes("DEWAN BANDARAYA KUCHING UTARA") && headingText.includes("MEMORANDUM")) {
    firstHeading.remove();
  }

  const firstMemoTable = Array.from(document.body.querySelectorAll("figure, table")).find((element) => {
    const text = String(element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return text.includes("kepada") && text.includes("daripada") && text.includes("ruj.");
  });

  if (firstMemoTable) {
    firstMemoTable.remove();
  }

  document.body.querySelectorAll("p").forEach((paragraph) => {
    if (!String(paragraph.textContent || "").trim() && paragraph.children.length === 0) {
      paragraph.remove();
    }
  });

  return document.body.innerHTML;
}

function localizePtIklToKuMemoHtml(html, language) {
  const source = getMemoContentHtml(html);
  if (!source || typeof window === "undefined" || !window.DOMParser) return source;

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const isMalay = language === "ms";
  const replacements = isMalay
    ? [
        [/APPLICATION FOR KU\(IKL\) REVIEW/gi, "PERMOHONAN UNTUK SEMAKAN KU(IKL)"],
        [/With due respect, the above matter is referred\./gi, "Dengan segala hormatnya perkara di atas dirujuk."],
        [/Application (FT-\d+) has been reviewed by PT\(IKL\) and forwarded to KU\(IKL\) for further review\./gi, "Permohonan $1 telah disemak oleh PT(IKL) dan dikemukakan kepada KU(IKL) untuk semakan lanjut."],
        [/Applicant/gi, "Pemohon"],
        [/Application Type/gi, "Jenis Permohonan"],
        [/Project/gi, "Projek"],
        [/Location/gi, "Lokasi"],
        [/Application for Site \(New Site\)/gi, "Permohonan Tapak (Tapak Baharu)"],
        [/Please proceed with KU\(IKL\) review and further action\./gi, "Mohon pihak KU(IKL) membuat semakan dan tindakan selanjutnya."],
        [/Thank you\./gi, "Sekian, terima kasih."],
      ]
    : [
        [/PERMOHONAN UNTUK SEMAKAN KU\(IKL\)/gi, "APPLICATION FOR KU(IKL) REVIEW"],
        [/Dengan segala hormatnya perkara di atas dirujuk\./gi, "With due respect, the above matter is referred."],
        [/Permohonan (FT-\d+) telah disemak oleh PT\(IKL\) dan dikemukakan kepada KU\(IKL\) untuk semakan lanjut\./gi, "Application $1 has been reviewed by PT(IKL) and forwarded to KU(IKL) for further review."],
        [/Pemohon/gi, "Applicant"],
        [/Jenis Permohonan/gi, "Application Type"],
        [/Projek/gi, "Project"],
        [/Lokasi/gi, "Location"],
        [/Permohonan Tapak \(Tapak Baharu\)/gi, "Application for Site (New Site)"],
        [/Mohon pihak KU\(IKL\) membuat semakan dan tindakan selanjutnya\./gi, "Please proceed with KU(IKL) review and further action."],
        [/Sekian, terima kasih\./gi, "Thank you."],
      ];

  const walker = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => {
    let text = node.nodeValue || "";
    replacements.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    node.nodeValue = text;
  });

  return document.body.innerHTML;
}

function cleanMemoSender(value) {
  return String(value || "")
    .replace(/\s*<\s*ALiS Notification Center\s*>\s*/gi, "")
    .trim();
}

function NotificationsPage() {
  const {
    notifications,
    markAsRead,
    unreadCount,
    loading,
    error,
    lastSyncedAt,
  } = useNotifications();
  const { language, t } = useLanguage();
  const [filter, setFilter] = useState("all");
  const [selectedNotificationId, setSelectedNotificationId] = useState("");
  const storedUser = getStoredUser();
  const Layout = isSuperAdminUser(storedUser)
    ? SuperAdminNotificationsLayout
    : isAdminUser(storedUser)
      ? AdminDashboardLayout
      : UserDashboardLayout;
  const useFormalMemoTemplate = isAdminUser(storedUser) && !isSuperAdminUser(storedUser);

  const activeFilters = useMemo(() => {
    const categories = new Set(notifications.map((item) => item.category));
    return filters.filter((item) => item.value === "all" || item.value === "unread" || categories.has(item.value));
  }, [notifications]);

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      if (filter === "all") return true;
      if (filter === "unread") return !item.read;
      return item.category === filter;
    });
  }, [filter, notifications]);

  const filterCounts = useMemo(() => {
    return activeFilters.reduce((counts, item) => {
      if (item.value === "all") {
        counts[item.value] = notifications.length;
      } else if (item.value === "unread") {
        counts[item.value] = unreadCount;
      } else {
        counts[item.value] = notifications.filter(
          (notification) => notification.category === item.value
        ).length;
      }

      return counts;
    }, {});
  }, [activeFilters, notifications, unreadCount]);

  const activeFilterLabel =
    activeFilters.find((item) => item.value === filter) || activeFilters[0];
  const selectedNotification =
    filtered.find((item) => item.id === selectedNotificationId) || null;

  function openMemo(item) {
    setSelectedNotificationId(item.id);
    if (!item.read) {
      markAsRead(item.id);
    }
  }

  function changeFilter(nextFilter) {
    setFilter(nextFilter);
    setSelectedNotificationId("");
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-950">
          {t("notifications.title", "Notifications")}
        </h1>
      </div>

      <Alert message={error} />

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              {t("notifications.inbox", "Inbox")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {lastSyncedAt
                ? `${t("notifications.lastSynced", "Last synced")}: ${formatDateTime(lastSyncedAt)}`
                : t("notifications.waitingForSync", "Waiting for live sync.")}
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            {filtered.length} {t("notifications.records", "record(s)")}
          </div>
        </div>

        <div className="grid min-h-[520px] lg:grid-cols-[230px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50/80 p-3 lg:border-b-0 lg:border-r">
            <nav className="space-y-1" aria-label={t("notifications.inbox", "Inbox")}>
              {activeFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => changeFilter(item.value)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                    filter === item.value
                      ? "bg-emerald-700 text-white"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  <span>{t(item.labelKey, item.fallback)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      filter === item.value
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-500"
                    }`}
                  >
                    {filterCounts[item.value] || 0}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedNotification
                    ? t("notifications.memo", "Memo")
                    : t(activeFilterLabel.labelKey, activeFilterLabel.fallback)}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedNotification
                    ? selectedNotification.time
                    : `${unreadCount} ${t("notifications.unread", "Unread")}`}
                </p>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex min-h-[380px] items-center justify-center px-6 text-center">
                <div className="max-w-md">
                  <span className="material-symbols-outlined text-[44px] text-slate-300">
                    mark_email_unread
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-slate-950">
                    {loading ? t("common.loading", "Loading...") : t("common.noNotifications", "No notifications")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {t(
                      "notifications.emptyDescription",
                      "Notifications will appear here when an application needs action or changes status."
                    )}
                  </p>
                </div>
              </div>
            ) : selectedNotification ? (
              <NotificationMemo
                item={selectedNotification}
                language={language}
                t={t}
                showActionButton={!useFormalMemoTemplate && (isAdminUser(storedUser) || isSuperAdminUser(storedUser))}
                useFormalTemplate={useFormalMemoTemplate}
                onBack={() => setSelectedNotificationId("")}
              />
            ) : (
              <div className="min-h-[450px] divide-y divide-slate-200">
                {filtered.map((item) => {
                  const style = typeStyles[item.type] || typeStyles.info;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openMemo(item)}
                      className={`group flex w-full gap-3 border-l-4 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        item.read
                          ? "border-l-transparent bg-white"
                          : "border-l-emerald-600 bg-emerald-50/40"
                      }`}
                    >
                      <span className={`material-symbols-outlined mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[20px] ${style.className}`}>
                        {style.icon}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {!item.read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                            )}
                            <h3
                              className={`truncate text-sm ${
                                item.read
                                  ? "font-semibold text-slate-800"
                                  : "font-bold text-slate-950"
                              }`}
                            >
                              {getLocalized(item, "title", language)}
                            </h3>
                          </div>
                          <time className="shrink-0 text-xs text-slate-500">
                            {item.time}
                          </time>
                        </div>

                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
                          {getLocalized(item, "message", language)}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="font-semibold text-slate-600">{item.reference}</span>
                          <StatusPill value={t(`status.${item.status}`, item.statusLabel)} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}

function NotificationMemo({
  item,
  language,
  t,
  onBack,
  showActionButton = true,
  useFormalTemplate = false,
}) {
  if (!item) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <span className="material-symbols-outlined text-[44px] text-slate-300">
            mail
          </span>
          <h3 className="mt-3 text-base font-semibold text-slate-950">
            {t("notifications.noMemoSelected", "No memo selected")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("notifications.noMemoDescription", "Open a notification to read its memo content.")}
          </p>
        </div>
      </div>
    );
  }

  const localizedTitle = getLocalized(item, "title", language);
  const subject = useFormalTemplate ? localizedTitle || item.subject : item.subject || localizedTitle;
  const body = getLocalized(item, "body", language) || getLocalized(item, "message", language);
  const bodyParts = getMemoBodyParts(body);
  const memoHtml = sanitizeMemoHtml(item.memoHtml);
  const formalCopy = useFormalTemplate
    ? getFormalMemoCopy(item, subject, bodyParts, language)
    : null;
  const displaySubject = formalCopy?.subject || subject;

  return (
    <article className="min-w-0 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              {t("notifications.backToInbox", "Back to Inbox")}
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {t("notifications.memo", "Memo")}
              </p>
              <h3 className="mt-1 break-words text-lg font-bold leading-7 text-slate-950">
                {displaySubject}
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {showActionButton && item.actionUrl && (
              <LinkButton
                to={item.actionUrl}
                icon="open_in_new"
                variant="secondary"
                className="min-h-8 px-3 py-1 text-xs"
              >
                {t("notifications.openTask", "Open Task")}
              </LinkButton>
            )}
            <StatusPill value={t(`status.${item.status}`, item.statusLabel)} />
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        {useFormalTemplate ? (
          <FormalNotificationMemo
            item={item}
            copy={formalCopy}
            bodyParts={bodyParts}
            memoHtml={memoHtml}
            language={language}
            t={t}
          />
        ) : (
          <>
            <dl className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm md:grid-cols-[88px_1fr]">
              <dt className="font-semibold text-slate-500">{t("notifications.memo.from", "From")}:</dt>
              <dd className="min-w-0 break-words text-slate-900">{item.from || "ALiS Notification Center"}</dd>
              <dt className="font-semibold text-slate-500">{t("notifications.memo.to", "To")}:</dt>
              <dd className="min-w-0 break-words text-slate-900">{item.to || "-"}</dd>
              <dt className="font-semibold text-slate-500">{t("notifications.memo.subject", "Subject")}:</dt>
              <dd className="min-w-0 break-words text-slate-900">{subject}</dd>
            </dl>

            <NotificationBody
              item={item}
              bodyParts={bodyParts}
              memoHtml={memoHtml}
              t={t}
            />
          </>
        )}

      </div>
    </article>
  );
}

function NotificationBody({ item, bodyParts, memoHtml, t }) {
  return (
    <div className="min-h-[180px] rounded-md border border-slate-200 bg-white px-4 py-4">
      {memoHtml ? (
        <div
          className="memo-template text-sm leading-6 text-slate-900 [&_figure]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:align-top [&_th]:align-top"
          dangerouslySetInnerHTML={{ __html: memoHtml }}
        />
      ) : bodyParts.lines.length > 0 || bodyParts.remark ? (
        <div className="space-y-3 text-sm leading-6 text-slate-700">
          {bodyParts.lines.map((line, index) => (
            <p key={`${item.id}:line:${index}`}>{line}</p>
          ))}
          {bodyParts.remark && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-amber-700">
                {t("notifications.memo.remark", "Remark")}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-800">
                {bodyParts.remark}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {t("notifications.memo.emptyBody", "No memo message was provided.")}
        </p>
      )}
    </div>
  );
}

function FormalNotificationMemo({ item, copy, bodyParts, memoHtml, language, t }) {
  const recipient = "PT(IKL)";
  const sender = cleanMemoSender(item.from) || "ALiS Notification Center";
  const memoDate = item.time || formatDateTime(item.timestamp);
  const memoContentHtml =
    item.memoTemplate === "pt_ikl_to_ku_ikl"
      ? localizePtIklToKuMemoHtml(memoHtml, language)
      : memoHtml
        ? getMemoContentHtml(memoHtml)
        : "";

  return (
    <section className="w-full text-slate-950">
      <div className="rounded-md border border-slate-300 bg-white px-5 py-6 text-sm leading-6 sm:px-7 sm:py-7">
        <div className="text-center font-serif text-xl font-bold uppercase leading-6 text-slate-950">
          <p>DEWAN BANDARAYA KUCHING UTARA</p>
          <p>MEMORANDUM</p>
        </div>

        <div className="mt-6 divide-y divide-slate-400 border-y border-slate-500">
          <MemoRow label={copy.labels.to} value={recipient} />
          <MemoRow label={copy.labels.through} value="" />
          <MemoRow label={copy.labels.from} value={sender} />
          <div className="grid divide-y divide-slate-500 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <MemoRow label={copy.labels.ourRef} value="" compact />
            <MemoRow label={copy.labels.date} value={memoDate} compact />
          </div>
          <div className="grid divide-y divide-slate-500 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <MemoRow label={copy.labels.yourRef} value="" compact />
            <MemoRow label={copy.labels.date} value="" compact />
          </div>
        </div>

        <div className="mt-4 space-y-4 leading-6 text-slate-950">
          {memoContentHtml ? (
            <div
              className="memo-template [&_figure]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:align-top [&_th]:align-top"
              dangerouslySetInnerHTML={{ __html: memoContentHtml }}
            />
          ) : copy.lines.length > 0 || bodyParts.remark ? (
            <>
              <h4 className="break-words font-bold uppercase leading-6 underline decoration-slate-800 underline-offset-2">
                {copy.subject}
              </h4>
              <p>{copy.opening}</p>
              {copy.lines.map((line, index) => (
                <p key={`${item.id}:formal-line:${index}`}>{line}</p>
              ))}
              {bodyParts.remark && (
                <div className="border border-slate-400 px-3 py-2">
                  <p className="font-bold">{t("notifications.memo.remark", "Remark")}:</p>
                  <p>{bodyParts.remark}</p>
                </div>
              )}
              <p>{copy.closing}</p>
              <div className="pt-1 font-semibold uppercase leading-5">
                <p>"AN HONOUR TO SERVE"</p>
                <p>"TOGETHER WE CARE"</p>
              </div>
              <div className="pt-6 leading-5">
                <p className="font-bold">ALiS Notification Center</p>
                <p>{copy.systemName}</p>
              </div>
            </>
          ) : (
            <p className="text-slate-500">
              {t("notifications.memo.emptyBody", "No memo message was provided.")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function getFormalMemoCopy(item, subject, bodyParts, language) {
  const isMalay = language === "ms";
  const reference = item.reference && item.reference !== "-" ? item.reference : item.appId || "permohonan";
  const status = item.eventStatus || item.status;
  const statusCopy = getWorkflowMemoCopy(status, reference, isMalay);

  return {
    labels: isMalay
      ? {
          to: "Kepada",
          through: "Melalui",
          from: "Daripada",
          ourRef: "Ruj. Kami",
          yourRef: "Ruj. Tuan",
          date: "Tarikh",
        }
      : {
          to: "To",
          through: "Through",
          from: "From",
          ourRef: "Our Ref.",
          yourRef: "Your Ref.",
          date: "Date",
        },
    subject: statusCopy.subject || subject || "-",
    lines: statusCopy.lines.length > 0 ? statusCopy.lines : bodyParts.lines,
    opening: isMalay
      ? "Dengan segala hormatnya perkara di atas dirujuk."
      : "With due respect, the above matter is referred.",
    closing: isMalay ? "Sekian, terima kasih." : "Thank you.",
    systemName: isMalay ? "Permohonan Lesen Iklan" : "Advertisement License Application",
  };
}

function getWorkflowMemoCopy(status, reference, isMalay) {
  const copy = {
    submitted: {
      en: {
        subject: `${reference} requires PT(IKL) review`,
        lines: [`New application ${reference} has been submitted and is waiting for review.`],
      },
      ms: {
        subject: `${reference} memerlukan semakan PT(IKL)`,
        lines: [`Permohonan baharu ${reference} telah dihantar dan sedang menunggu semakan.`],
      },
    },
    ku_ikl_review: {
      en: {
        subject: `${reference} requires KU(IKL) review`,
        lines: [`Application ${reference} is ready for KU(IKL) verification.`],
      },
      ms: {
        subject: `${reference} memerlukan semakan KU(IKL)`,
        lines: [`Permohonan ${reference} sedia untuk pengesahan KU(IKL).`],
      },
    },
    technical_review: {
      en: {
        subject: `${reference} requires technical review`,
        lines: [`Application ${reference} is ready for department technical review.`],
      },
      ms: {
        subject: `${reference} memerlukan semakan teknikal`,
        lines: [`Permohonan ${reference} sedia untuk semakan teknikal jabatan.`],
      },
    },
    technical_site_visit: {
      en: {
        subject: `${reference} requires technical site visit review`,
        lines: [`Application ${reference} is ready for department site visit review.`],
      },
      ms: {
        subject: `${reference} memerlukan semakan lawatan tapak teknikal`,
        lines: [`Permohonan ${reference} sedia untuk semakan lawatan tapak jabatan.`],
      },
    },
    technical_amendment: {
      en: {
        subject: `${reference} requires IKL (TECHNICAL) amendment`,
        lines: [`Application ${reference} requires IKL (TECHNICAL) amendment before KU(IKL) can continue.`],
      },
      ms: {
        subject: `${reference} memerlukan pindaan IKL (TECHNICAL)`,
        lines: [`Permohonan ${reference} memerlukan pindaan IKL (TECHNICAL) sebelum KU(IKL) boleh meneruskan semakan.`],
      },
    },
    technical_review_completed: {
      en: {
        subject: `${reference} requires KU(IKL) final technical check`,
        lines: [`Application ${reference} has completed technical department feedback and is ready for KU(IKL) review.`],
      },
      ms: {
        subject: `${reference} memerlukan semakan teknikal akhir KU(IKL)`,
        lines: [`Permohonan ${reference} telah selesai maklum balas jabatan teknikal dan sedia untuk semakan KU(IKL).`],
      },
    },
    management_review: {
      en: {
        subject: `${reference} requires KB(LES) verification`,
        lines: [`Application ${reference} has completed KU(IKL) final checking and is ready for KB(LES) verification.`],
      },
      ms: {
        subject: `${reference} memerlukan pengesahan KB(LES)`,
        lines: [`Permohonan ${reference} telah selesai semakan akhir KU(IKL) dan sedia untuk pengesahan KB(LES).`],
      },
    },
    approved: {
      en: {
        subject: "Final approval received",
        lines: [`Application ${reference} has final TP(RES)/PGH approval. Please generate the approval letter and bill.`],
      },
      ms: {
        subject: "Kelulusan akhir diterima",
        lines: [`Permohonan ${reference} telah menerima kelulusan akhir TP(RES)/PGH. Sila jana surat kelulusan dan bil.`],
      },
    },
    bill_pending_ku: {
      en: {
        subject: `${reference} requires KU(IKL) bill confirmation`,
        lines: [`Application ${reference} has a generated bill waiting for KU(IKL) confirmation.`],
      },
      ms: {
        subject: `${reference} memerlukan pengesahan bil KU(IKL)`,
        lines: [`Permohonan ${reference} mempunyai bil yang dijana dan sedang menunggu pengesahan KU(IKL).`],
      },
    },
    payment_submitted: {
      en: {
        subject: "Payment proof submitted",
        lines: [`Applicant has uploaded payment proof for application ${reference}. Please verify the receipt.`],
      },
      ms: {
        subject: "Bukti bayaran dihantar",
        lines: [`Pemohon telah memuat naik bukti bayaran untuk permohonan ${reference}. Sila sahkan resit tersebut.`],
      },
    },
    payment_verified: {
      en: {
        subject: "License issuance required",
        lines: [`Payment for application ${reference} has been verified. Please generate the advertisement license and QR code.`],
      },
      ms: {
        subject: "Penjanaan lesen diperlukan",
        lines: [`Bayaran untuk permohonan ${reference} telah disahkan. Sila jana lesen iklan dan kod QR.`],
      },
    },
    mphlg_processing: {
      en: {
        subject: "MPHLG approval required",
        lines: [`Application ${reference} is ready for MPHLG approval.`],
      },
      ms: {
        subject: "Kelulusan MPHLG diperlukan",
        lines: [`Permohonan ${reference} sedia untuk kelulusan MPHLG.`],
      },
    },
    mphlg_decision_received: {
      en: {
        subject: "SUT approval required",
        lines: [`Application ${reference} is ready for SUT approval.`],
      },
      ms: {
        subject: "Kelulusan SUT diperlukan",
        lines: [`Permohonan ${reference} sedia untuk kelulusan SUT.`],
      },
    },
  };

  return copy[status]?.[isMalay ? "ms" : "en"] || { subject: "", lines: [] };
}

function MemoRow({ label, value, compact = false }) {
  return (
    <div className={`grid grid-cols-[96px_1fr] items-start gap-2 px-2 ${compact ? "py-1.5" : "py-2"}`}>
      <span className="font-bold">{label} :</span>
      <span className="min-w-0 break-words">{value ?? ""}</span>
    </div>
  );
}

function SuperAdminNotificationsLayout({ children }) {
  return <AppShell role="superadmin">{children}</AppShell>;
}

export default NotificationsPage;

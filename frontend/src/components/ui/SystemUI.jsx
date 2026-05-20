import { Link } from "react-router-dom";
import {
  AD_LICENSE_FLOW,
  formatDateTime,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  normalizeStatus,
} from "../../utils/workflow";

export function Icon({ name, className = "", title, ...props }) {
  if (!name) return null;

  return (
    <span
      className={`material-symbols-outlined notranslate leading-none ${className}`}
      aria-hidden={title ? undefined : true}
      title={title}
      translate="no"
      {...props}
    >
      {name}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-5 text-slate-600">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  icon,
  ...props
}) {
  const variants = {
    primary:
      "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800",
    secondary:
      "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
    danger:
      "border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
    quiet:
      "border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
  };

  return (
    <button
      type="button"
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-[14px] font-semibold leading-5 transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      <Icon name={icon} className="text-[18px]" />
      {children}
    </button>
  );
}

export function LinkButton({ to, children, icon, variant = "primary", className = "" }) {
  const variants = {
    primary:
      "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800",
    secondary:
      "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
  };

  return (
    <Link
      to={to}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-[14px] font-semibold leading-5 transition ${variants[variant]} ${className}`}
    >
      <Icon name={icon} className="text-[18px]" />
      {children}
    </Link>
  );
}

export function Panel({ title, description, action, children, className = "" }) {
  return (
    <section className={`rounded-md border border-slate-200 bg-white ${className}`}>
      {(title || description || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            {title && (
              <h2 className="text-[16px] font-semibold leading-6 text-slate-950">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-[14px] leading-5 text-slate-500">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, note, icon, tone = "emerald" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        {icon && (
          <Icon name={icon} className={`rounded-md p-2 text-[20px] ${tones[tone]}`} />
        )}
      </div>
      {note && <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>}
    </div>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[14px] font-semibold leading-5 text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Alert({ type = "error", message }) {
  if (!message) return null;

  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`mb-4 rounded-md border px-3 py-2.5 text-[14px] leading-5 ${styles}`}>
      {message}
    </div>
  );
}

export function StatusPill({ value }) {
  const normalized = normalizeStatus(value);
  let className = "border-slate-200 bg-slate-100 text-slate-700";

  if (
    normalized.includes("submitted") ||
    normalized.includes("screened") ||
    normalized.includes("approved") ||
    normalized.includes("verified") ||
    normalized.includes("issued") ||
    normalized.includes("active") ||
    normalized.includes("supported") ||
    normalized.includes("disokong") ||
    normalized.includes("dihantar") ||
    normalized.includes("disahkan") ||
    normalized.includes("dijana") ||
    normalized.includes("aktif") ||
    normalized.includes("lulus") ||
    normalized.includes("passed")
  ) {
    className = "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("review") ||
    normalized.includes("processing") ||
    normalized.includes("condition") ||
    normalized.includes("draft") ||
    normalized.includes("warning") ||
    normalized.includes("belum") ||
    normalized.includes("menunggu") ||
    normalized.includes("semakan") ||
    normalized.includes("bersyarat") ||
    normalized.includes("draf") ||
    normalized.includes("amaran")
  ) {
    className = "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    normalized.includes("reject") ||
    normalized.includes("failed") ||
    normalized.includes("revoked") ||
    normalized.includes("invalid") ||
    normalized.includes("tidak disokong") ||
    normalized.includes("ditolak") ||
    normalized.includes("gagal") ||
    normalized.includes("dibatalkan") ||
    normalized.includes("tidak sah")
  ) {
    className = "border-red-200 bg-red-50 text-red-700";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[13px] font-semibold leading-5 ${className}`}
    >
      {value || "Draft"}
    </span>
  );
}

export function EmptyState({ title = "No data", description, icon = "inbox" }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <Icon name={icon} className="text-4xl text-slate-300" />
      <p className="mt-2 text-sm font-semibold text-slate-700">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
    </div>
  );
}

export function DataTable({ columns, rows, loading, emptyText, loadingText = "Loading..." }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[720px] text-left text-[14px] leading-5">
        <thead className="bg-slate-50 text-[13px] uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="border-b border-slate-200 px-3 py-2.5">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                {loadingText}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                {emptyText || "No records found."}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2.5 align-top text-slate-700">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function WorkflowStrip({ currentStatus, language = "en" }) {
  const currentIndex = Math.max(
    0,
    AD_LICENSE_FLOW.findIndex((step) => step.status === normalizeStatus(currentStatus))
  );

  return (
    <div className="grid grid-cols-7 gap-2">
      {AD_LICENSE_FLOW.map((step, index) => {
        const active = index <= currentIndex;

        return (
          <div
            key={step.code}
            className={`rounded-md border px-3 py-3 ${
              active
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-semibold text-slate-500">{step.code}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {language === "ms" ? step.phase : step.phaseEn}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {language === "ms"
                ? `${step.targetDays} hari`
                : `${step.targetDays} day${step.targetDays === 1 ? "" : "s"}`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function ApplicationSummary({ app, labels = {}, actions, statusLabel, applicationType }) {
  if (!app) return null;
  const status = statusLabel || formatWorkflowStatus(app.status);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {labels.selectedApplication || "Selected Application"}
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-5 text-slate-950">
            {getApplicationReference(app)}
          </p>
          <p className="text-[14px] leading-5 text-slate-600">
            {app.title || labels.defaultTitle || "Advertisement License Application"}
          </p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 text-[14px] leading-5 md:grid-cols-3">
        <Info label={labels.applicant || "Applicant"} value={getApplicantName(app)} />
        <Info label={labels.type || "Type"} value={applicationType || getApplicationType(app)} />
        <div>
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {labels.status || "Status"}
          </p>
          <div className="mt-1">
            <StatusPill value={status} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 text-[14px] leading-5 md:grid-cols-3">
        <Info
          label={labels.location || "Location"}
          value={getApplicationLocation(app)}
        />
        <Info label={labels.created || "Created"} value={formatDateTime(app.created_at)} />
        <Info label={labels.updated || "Updated"} value={formatDateTime(app.updated_at)} />
      </div>
    </div>
  );
}

export function Info({ label, value }) {
  return (
    <div>
      <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-[14px] font-medium leading-5 text-slate-800">{value || "-"}</p>
    </div>
  );
}

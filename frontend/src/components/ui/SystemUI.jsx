import { Link } from "react-router-dom";
import {
  AD_LICENSE_FLOW,
  formatDate,
  formatWorkflowStatus,
  getApplicationReference,
  normalizeStatus,
} from "../../utils/workflow";

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
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {icon && (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, icon, variant = "primary" }) {
  const variants = {
    primary:
      "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800",
    secondary:
      "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
  };

  return (
    <Link
      to={to}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold transition ${variants[variant]}`}
    >
      {icon && (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
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
              <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm leading-5 text-slate-500">
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
          <span
            className={`material-symbols-outlined rounded-md p-2 text-[20px] ${tones[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>
      {note && <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>}
    </div>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
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
    <div className={`mb-4 rounded-md border px-3 py-2.5 text-sm ${styles}`}>
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
    normalized.includes("warning")
  ) {
    className = "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    normalized.includes("reject") ||
    normalized.includes("failed") ||
    normalized.includes("revoked") ||
    normalized.includes("invalid")
  ) {
    className = "border-red-200 bg-red-50 text-red-700";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ${className}`}
    >
      {value || "Draft"}
    </span>
  );
}

export function EmptyState({ title = "No data", description, icon = "inbox" }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <span className="material-symbols-outlined text-4xl text-slate-300">
        {icon}
      </span>
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
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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

export function ApplicationSummary({ app, labels = {} }) {
  if (!app) return null;
  const currentStep = Math.min(Number(app.current_step || 1), 5);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.selectedApplication || "Selected Application"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {getApplicationReference(app)}
          </p>
          <p className="text-sm text-slate-600">
            {app.title || labels.defaultTitle || "Advertisement License Application"}
          </p>
        </div>
        <StatusPill value={formatWorkflowStatus(app.status)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <Info label={labels.created || "Created"} value={formatDate(app.created_at)} />
        <Info label={labels.updated || "Updated"} value={formatDate(app.updated_at)} />
        <Info label={labels.step || "Step"} value={`${currentStep} / 5`} />
      </div>
    </div>
  );
}

export function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value || "-"}</p>
    </div>
  );
}

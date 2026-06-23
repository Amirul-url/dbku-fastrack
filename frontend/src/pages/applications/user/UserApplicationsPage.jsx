import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../../context/LanguageContext";
import UserDashboardLayout from "../../../layout/UserDashboardLayout";
import { fetchApplicationList } from "../../../services/api";
import {
  DataTable,
  Field,
  LinkButton,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../../components/ui/SystemUI";
import {
  formatCompactDateTime,
  formatWorkflowStatus,
  getApplicantActionKey,
  getApplicantApplicationRoute,
  getApplicantDisplayStatus,
  getApplicationReference,
  getProjectName,
  normalizeStatus,
} from "../../../utils/workflow";

const APPLICANT_STATUS_FILTER_OPTIONS = [
  "Draft",
  "Submitted",
  "Under Review",
  "Rejected",
  "Approved",
];

function UserApplicationsPage() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchApplicationList();
      setApplications(list);
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApplications();
  }, [fetchApplications]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return applications.filter((app) => {
      const haystack = [
        getApplicationReference(app),
        getProjectName(app, language),
        getApplicationRemark(app),
        translatedStatus(t, app.status),
      ]
        .join(" ")
        .toLowerCase();

      const status = getApplicantFilterStatus(app);
      return (!q || haystack.includes(q)) && (statusFilter === "ALL" || status === statusFilter);
    });
  }, [applications, keyword, language, statusFilter, t]);

  const summary = useMemo(() => {
    return {
      total: applications.length,
      drafts: applications.filter((app) => normalizeStatus(app.status) === "draft").length,
      submitted: applications.filter((app) => normalizeStatus(app.status) !== "draft").length,
      licenses: applications.filter((app) => normalizeStatus(app.status) === "license_issued").length,
    };
  }, [applications]);

  function openApplication(app) {
    const params = new URLSearchParams({
      id: String(app.id),
      returnTab: "applications",
    });

    navigate(`/applications/${app.id}/${getApplicantApplicationRoute(app)}?${params.toString()}`);
  }

  return (
    <UserDashboardLayout>
      <PageHeader
        eyebrow={t("applicant.records")}
        title={t("applicant.applicationsTitle")}
        description={t("applicant.applicationsDescription")}
        actions={<LinkButton to="/applications/new" icon="add">{t("common.newApplication")}</LinkButton>}
      />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label={t("common.total")} value={summary.total} icon="folder" />
        <StatCard label={t("common.drafts")} value={summary.drafts} icon="edit_document" tone="amber" />
        <StatCard label={t("common.submitted")} value={summary.submitted} icon="send" tone="blue" />
        <StatCard label={t("common.eLicenses")} value={summary.licenses} icon="qr_code_2" />
      </section>

      <Panel title={t("common.search")} className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t("common.keyword")} className="md:col-span-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="form-input"
              placeholder={t("applicant.searchPlaceholder")}
            />
          </Field>
          <Field label={t("common.status")}>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="form-input"
            >
              <option value="ALL">{t("common.allStatuses")}</option>
              {APPLICANT_STATUS_FILTER_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {translatedStatus(t, status)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>

      <Panel title={t("applicant.applicationList")} description={`${filtered.length} ${t("applicant.recordsFound")}`}>
        <DataTable
          loading={loading}
          rows={filtered}
          loadingText={t("common.loading")}
          emptyText={t("applicant.noUserApplications")}
          columns={[
            {
              key: "reference",
              label: t("common.reference"),
              render: (app) => (
                <span className="font-semibold text-emerald-700">
                  {getApplicationReference(app)}
                </span>
              ),
            },
            {
              key: "project",
              label: t("common.project"),
              className: "w-[38%]",
              render: (app) => (
                <span className="block max-w-[42rem] whitespace-pre-line leading-5">
                  {getProjectName(app, language)}
                </span>
              ),
            },
            {
              key: "status",
              label: t("common.status"),
              className: "w-[12%]",
              render: (app) => <StatusPill value={translatedStatus(t, getApplicantFilterStatus(app))} />,
            },
            {
              key: "updated",
              label: t("common.updated"),
              className: "w-[12%]",
              render: (app) => (
                <span className="whitespace-nowrap text-sm leading-5">
                  {formatCompactDateTime(app.updated_at)}
                </span>
              ),
            },
            {
              key: "action",
              label: t("common.action"),
              className: "w-[8%]",
              render: (app) => (
                <button
                  type="button"
                  onClick={() => openApplication(app)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t(getApplicantActionKey(app))}
                </button>
              ),
            },
          ]}
        />
      </Panel>
    </UserDashboardLayout>
  );
}

function translatedStatus(t, status) {
  const normalized = normalizeStatus(status);
  const applicantStatusLabels = {
    invoice_generated: t("applicant.statusReadyForPayment", "Ready for Payment"),
  };

  if (applicantStatusLabels[normalized]) {
    return applicantStatusLabels[normalized];
  }

  const displayStatus = getApplicantDisplayStatus(status);
  return t(`status.${displayStatus}`, formatWorkflowStatus(displayStatus));
}

function getApplicantFilterStatus(app) {
  const status = normalizeStatus(app?.status);

  if (status === "draft") {
    return "Draft";
  }

  if (["approved", "approved_with_conditions", "invoice_generated", "payment_submitted", "payment_verified", "license_issued"].includes(status)) {
    return "Approved";
  }

  if (["incomplete", "rejected"].includes(status)) {
    return "Rejected";
  }

  if (status === "submitted") {
    return "Submitted";
  }

  if (status && status !== "draft") {
    return "Under Review";
  }

  return "";
}

function getApplicationRemark(app) {
  const status = normalizeStatus(app?.status);
  const formData = app?.form_data || {};
  const approvalLetter = formData.approval_letter || app?.approval_letter || {};

  if (["invoice_generated", "payment_submitted", "payment_verified", "license_issued"].includes(status)) {
    return cleanRemark(
      approvalLetter.remarks ||
        approvalLetter.comment ||
        approvalLetter.notes ||
        formData.payment?.verification_notes
    );
  }

  if (!["incomplete", "rejected"].includes(status)) return "";

  return cleanRemark(
    formData.correction_request?.remarks ||
      app?.latest_remark ||
      formData.auto_screening?.remarks
  );
}

function cleanRemark(value) {
  const remark = String(value || "").trim();
  return ["", "-", "[]"].includes(remark) ? "" : remark;
}

export default UserApplicationsPage;

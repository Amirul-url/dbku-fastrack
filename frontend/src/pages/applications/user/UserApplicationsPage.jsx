import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../../context/LanguageContext";
import UserDashboardLayout from "../../../layout/UserDashboardLayout";
import { apiRequest } from "../../../services/api";
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
  getApplicationType,
  getProjectName,
  normalizeStatus,
} from "../../../utils/workflow";

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
      const data = await apiRequest("/applications/");
      setApplications(Array.isArray(data) ? data : data?.results || []);
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
        getProjectName(app),
        getApplicationType(app, language),
        translatedStatus(t, app.status),
      ]
        .join(" ")
        .toLowerCase();

      const status = getApplicantDisplayStatus(app.status);
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
    navigate(`/applications/${app.id}/${getApplicantApplicationRoute(app)}?id=${app.id}`);
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
              <option value="draft">{t("status.draft")}</option>
              <option value="under_review">{t("status.under_review")}</option>
              <option value="approved">{t("status.approved")}</option>
              <option value="invoice_generated">{t("status.invoice_generated")}</option>
              <option value="license_issued">{t("status.license_issued")}</option>
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
                <button
                  type="button"
                  onClick={() => openApplication(app)}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {getApplicationReference(app)}
                </button>
              ),
            },
            { key: "project", label: t("common.project"), render: getProjectName },
            { key: "type", label: t("common.type"), render: (app) => getApplicationType(app, language) },
            {
              key: "status",
              label: t("common.status"),
              render: (app) => <StatusPill value={translatedStatus(t, app.status)} />,
            },
            {
              key: "updated",
              label: t("common.updated"),
              render: (app) => (
                <span className="whitespace-nowrap text-[12px] leading-5">
                  {formatCompactDateTime(app.updated_at)}
                </span>
              ),
            },
            {
              key: "action",
              label: t("common.action"),
              render: (app) => (
                <button
                  type="button"
                  onClick={() => openApplication(app)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
  const displayStatus = getApplicantDisplayStatus(status);
  return t(`status.${displayStatus}`, formatWorkflowStatus(displayStatus));
}

export default UserApplicationsPage;

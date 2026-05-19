import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import {
  apiRequest,
  deleteApplicationDocument,
  fetchAuthenticatedBlob,
  getApplicationDocumentUrl,
  getStoredUser,
  uploadApplicationDocument,
} from "../../services/api";
import {
  Alert,
  ApplicationSummary,
  Button,
  DataTable,
  Field,
  Info,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  getInvoiceNo,
  getLicenseId,
  getProjectName,
  normalizeStatus,
} from "../../utils/workflow";

const TECHNICAL_DEPARTMENTS = ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"];
const IKL_TASK_DEPARTMENTS = ["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)"];
const IKL_DEPARTMENT_STATUS_SCOPE = {
  "PT(IKL)": ["submitted", "incomplete"],
  "KU(IKL)": ["ku_ikl_review", "technical_review_completed"],
  "IKL (TECHNICAL)": ["technical_review", "technical_site_visit", "technical_amendment"],
};
const TECHNICAL_DEPARTMENT_TASK_STATUSES = [
  "technical_review",
  "technical_site_visit",
];
const TECHNICAL_REVIEW_STATUSES = new Set([
  ...TECHNICAL_DEPARTMENT_TASK_STATUSES,
  "technical_review_completed",
]);

function ProcessWorkspace({ type }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const config = configs[type];
  const userDepartment = normalizeDepartmentCode(getStoredUser()?.department);

  if (!canAccessWorkspace(config, userDepartment)) {
    return <AdminDashboardLayout />;
  }

  return (
    <ProcessWorkspaceContent
      config={config}
      navigate={navigate}
      t={t}
      userDepartment={userDepartment}
    />
  );
}

function ProcessWorkspaceContent({ config, navigate, t, userDepartment }) {
  const location = useLocation();
  const querySelectedId = new URLSearchParams(location.search).get("id") || "";
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(querySelectedId);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [decision, setDecision] = useState(config.defaultDecision || "");
  const [comment, setComment] = useState("");
  const [technicalSite, setTechnicalSite] = useState({
    site_photos: [],
    license_fee_calculation: "",
    deposit_calculation: "",
    site_remarks: "",
  });

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    if (querySelectedId) setSelectedId(querySelectedId);
  }, [querySelectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }

    let active = true;

    async function fetchSelectedDetail() {
      try {
        setDetailLoading(true);
        const detail = await apiRequest(`/applications/${selectedId}/`);
        if (active) setSelectedDetail(detail);
      } catch (err) {
        if (active) {
          setSelectedDetail(null);
          setError(err.message || "Failed to load selected application details.");
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    fetchSelectedDetail();

    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    const saved = selectedDetail?.form_data?.technical_site_visit || {};
    const savedPhotos = Array.isArray(saved.site_photos)
      ? saved.site_photos
      : saved.site_photo
        ? [saved.site_photo]
        : [];
    setTechnicalSite({
      site_photos: savedPhotos,
      license_fee_calculation: saved.license_fee_calculation || "",
      deposit_calculation: saved.deposit_calculation || "",
      site_remarks: saved.site_remarks || saved.site_photo_note || "",
    });
  }, [selectedDetail?.id, selectedDetail?.updated_at]);

  async function fetchApplications({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      setError("");
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
      if (!selectedId && list.length > 0) setSelectedId(String(list[0].id));
    } catch (err) {
      setError(err.message || "Failed to load applications.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function refreshWorkspaceData() {
      if (!active) return;

      try {
        await fetchApplications({ silent: true });

        if (selectedId) {
          const detail = await apiRequest(`/applications/${selectedId}/`);
          if (active) setSelectedDetail(detail);
        }
      } catch {
        // Keep the current screen stable during background refresh.
      }
    }

    window.addEventListener("fastrack:applications-changed", refreshWorkspaceData);
    const interval = window.setInterval(refreshWorkspaceData, 15000);

    return () => {
      active = false;
      window.removeEventListener("fastrack:applications-changed", refreshWorkspaceData);
      window.clearInterval(interval);
    };
  }, [selectedId]);

  const isIklWorkspace = config.key === "screening";
  const isDepartmentTechnicalWorkspace = config.key === "technical";
  const isApprovalWorkspace = config.key === "approval";
  const isFocusedPersonalWorkspace =
    isIklWorkspace || isDepartmentTechnicalWorkspace || isApprovalWorkspace;
  const showSiteVisitFields =
    config.showTechnicalSiteVisit && !isDepartmentTechnicalWorkspace;
  const showBottomFormButton = !isFocusedPersonalWorkspace;
  const actionGridClass = isFocusedPersonalWorkspace || isDepartmentTechnicalWorkspace
    ? "grid grid-cols-1 gap-2 pt-1"
    : "grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3";

  const statusScopedApplications = useMemo(() => {
    const statusScope = getWorkspaceStatusScope(config, userDepartment);
    return applications.filter((app) => {
      const normalizedStatus = normalizeStatus(app.status);
      const isInStatusScope =
        statusScope.length === 0 || statusScope.includes(normalizedStatus);
      const isInDepartmentScope =
        !isDepartmentTechnicalWorkspace ||
        !hasTechnicalDepartmentReview(app, userDepartment);

      return isInStatusScope && isInDepartmentScope;
    });
  }, [applications, config, isDepartmentTechnicalWorkspace, userDepartment]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return statusScopedApplications.filter((app) => {
      const haystack = [
        getApplicationReference(app),
        getApplicantName(app),
        getProjectName(app),
        getApplicationType(app),
        getApplicationLocation(app),
      ]
        .join(" ")
        .toLowerCase();

      return !q || haystack.includes(q);
    });
  }, [keyword, statusScopedApplications]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const hasSelected = filtered.some((app) => String(app.id) === String(selectedId));

    if (!hasSelected) {
      setSelectedId(String(filtered[0].id));
    }
  }, [filtered, selectedId]);

  const selected = useMemo(() => {
    return filtered.find((app) => String(app.id) === String(selectedId)) || filtered[0] || null;
  }, [filtered, selectedId]);
  const selectedRecord =
    selectedDetail && String(selectedDetail.id) === String(selected?.id)
      ? { ...selected, ...selectedDetail }
      : selected;

  const stats = useMemo(
    () => config.stats(statusScopedApplications, userDepartment),
    [config, statusScopedApplications, userDepartment]
  );

  async function submitAction(action, overrides = {}) {
    if (!selectedRecord?.id) {
      setError("Please select an application first.");
      return;
    }

    const actionDecision = overrides.decision || action.decision || decision;
    const cleanedComment = cleanRemark(overrides.comment ?? comment);
    const requiresDecisionRemark =
      (overrides.checkDecisionRemark ?? config.showComment) &&
      /reject|amendment|condition|not supported/i.test(String(actionDecision || ""));

    if ((action.requiresComment || requiresDecisionRemark) && !cleanedComment) {
      setError("Please enter notes or comments first.");
      return;
    }

    if (action.requiresReceipt && !selectedRecord.form_data?.payment?.receipt_file) {
      setError("Please wait for the applicant to upload a payment receipt first.");
      return;
    }

    if (action.requiresSubmittedReceipt && normalizeStatus(selectedRecord.status) !== "payment_submitted") {
      setError("Receipt verification is available after the applicant submits a receipt.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const current = selectedRecord;
      const body = action.buildPayload(current, {
        decision: actionDecision,
        comment: cleanedComment,
        technicalSite,
        department: userDepartment,
      });

      await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      setSuccess(t(action.successKey, action.success));
      setComment("");
      await fetchApplications();
      const refreshed = await apiRequest(`/applications/${selectedRecord.id}/`);
      setSelectedDetail(refreshed);
    } catch (err) {
      setError(err.message || action.error || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminDashboardLayout>
      {!isFocusedPersonalWorkspace && (
        <PageHeader
          eyebrow={t(config.eyebrowKey, config.eyebrow)}
          title={t(config.titleKey, config.title)}
          description={t(config.descriptionKey, config.description)}
          actions={
            <Button
              type="button"
              variant="secondary"
              icon="arrow_back"
              onClick={() => navigate("/dashboard/admin")}
            >
              {t("workspace.backToDashboard")}
            </Button>
          }
        />
      )}

      {isFocusedPersonalWorkspace && (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            icon="arrow_back"
            onClick={() => navigate("/dashboard/admin")}
          >
            {t("workspace.backToDashboard")}
          </Button>
        </div>
      )}

      <Alert message={error} />
      <Alert type="success" message={success} />

      {!isFocusedPersonalWorkspace && (
        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          {stats.map((item) => (
            <StatCard key={item.labelKey || item.label} {...item} label={t(item.labelKey, item.label)} />
          ))}
        </section>
      )}

      <section
        className={
          isFocusedPersonalWorkspace
            ? "mb-6 space-y-6"
            : "mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3"
        }
      >
        {!isFocusedPersonalWorkspace && (
          <Panel
            title={t(config.queueTitleKey, config.queueTitle)}
            description={t("workspace.queue.instructions")}
            className="xl:col-span-2"
          >
            <div className="mb-4">
              <Field label={t("common.search")}>
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className="form-input"
                  placeholder={t("workspace.search.placeholder")}
                />
              </Field>
            </div>

            <DataTable
              loading={loading}
              rows={filtered}
              emptyText={t("workspace.empty")}
              columns={[
                {
                  key: "reference",
                  label: t("common.reference"),
                  render: (app) => (
                    <button
                      type="button"
                      onClick={() => setSelectedId(String(app.id))}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      {getApplicationReference(app)}
                    </button>
                  ),
                },
                { key: "applicant", label: t("common.applicant"), render: getApplicantName },
                { key: "project", label: t("common.project"), render: getProjectName },
                {
                  key: "status",
                  label: t("common.status"),
                  render: (app) => (
                    <StatusPill value={getWorkspaceStatusLabel(app, config, t, userDepartment)} />
                  ),
                },
                {
                  key: "updated",
                  label: t("common.updated"),
                  render: (app) => formatDate(app.updated_at),
                },
              ]}
            />
          </Panel>
        )}

        <Panel
          title={t("workspace.actionPanel")}
          description={getWorkspaceActionDescription(config, t, userDepartment)}
        >
          {!selectedRecord ? (
            <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
          ) : (
            <div className="space-y-4">
              <ApplicationSummary
                app={selectedRecord}
                labels={{
                  selectedApplication: t("workspace.selectedApplication"),
                  defaultTitle: t("workspace.defaultApplicationTitle"),
                  applicant: t("common.applicant"),
                  type: t("common.type"),
                  status: t("common.status"),
                  location: t("workspace.location"),
                  created: t("workspace.created"),
                  updated: t("common.updated"),
                }}
                statusLabel={getWorkspaceStatusLabel(selectedRecord, config, t, userDepartment)}
                applicationType={getLocalizedApplicationType(selectedRecord, t)}
                actions={
                  isFocusedPersonalWorkspace ? (
                    <Button
                      variant="secondary"
                      icon="visibility"
                      onClick={() => navigate(`/admin/applications/${selectedRecord.id}`)}
                    >
                      {t("workspace.openForm")}
                    </Button>
                  ) : null
                }
              />

              {isIklWorkspace ? (
                <IklWorkspaceSections
                  t={t}
                  config={config}
                  selectedRecord={selectedRecord}
                  decision={decision}
                  setDecision={setDecision}
                  comment={comment}
                  setComment={setComment}
                  technicalSite={technicalSite}
                  setTechnicalSite={setTechnicalSite}
                  saving={saving}
                  submitAction={submitAction}
                  userDepartment={userDepartment}
                />
              ) : (
                <>
                  {config.showDecision && (
                    <Field label={t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Decision")}>
                      <select
                        value={decision}
                        onChange={(event) => setDecision(event.target.value)}
                        className="form-input"
                      >
                        {config.decisions.map((item) => (
                          <option key={item.value || item} value={item.value || item}>
                            {t(item.labelKey, item.label || item)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {config.showComment && (
                    <Field label={t(config.commentLabelKey, config.commentLabel || "Notes")}>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows="5"
                        className="form-input"
                        placeholder={t(config.commentPlaceholderKey, config.commentPlaceholder || "Enter notes")}
                      />
                    </Field>
                  )}

                  {showSiteVisitFields && (
                    <TechnicalSiteVisitFields
                      t={t}
                      applicationId={selectedRecord.id}
                      value={technicalSite}
                      onChange={setTechnicalSite}
                      onFileChange={async (files) => {
                        const fileList = Array.from(files || []);
                        if (fileList.length === 0) return;
                        const sitePhotos = await Promise.all(
                          fileList.map((file) =>
                            uploadApplicationDocument(
                              selectedRecord.id,
                              "Technical Site Photo",
                              file
                            )
                          )
                        );
                        setTechnicalSite((prev) => ({
                          ...prev,
                          site_photos: [...(prev.site_photos || []), ...sitePhotos],
                        }));
                      }}
                    />
                  )}

                  {detailLoading ? (
                    <p className="text-sm text-slate-500">{t("common.loadingSelectedApplication")}</p>
                  ) : (
                    config.details && <config.details app={selectedRecord} t={t} />
                  )}

                  <div className={actionGridClass}>
                    {showBottomFormButton && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => navigate(`/admin/applications/${selectedRecord.id}`)}
                      >
                        {t("workspace.openForm")}
                      </Button>
                    )}
                    {config.actions.map((action) => (
                      <Button
                        key={action.label}
                        onClick={() => submitAction(action)}
                        disabled={saving}
                        variant={action.variant || "primary"}
                        icon={action.icon}
                        className="w-full"
                      >
                        {saving ? t("workspace.saving") : t(action.labelKey, action.label)}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
      </section>

      {!isFocusedPersonalWorkspace && (
        <Panel title={t("workspace.selectedRecord")} description={t("workspace.selectedRecordDesc")}>
          {selectedRecord ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Info label={t("common.reference")} value={getApplicationReference(selectedRecord)} />
              <Info label={t("common.applicant")} value={getApplicantName(selectedRecord)} />
              <Info label={t("common.type")} value={getLocalizedApplicationType(selectedRecord, t)} />
              <Info label={t("common.project")} value={getProjectName(selectedRecord)} />
              <Info label={t("workspace.location")} value={getApplicationLocation(selectedRecord)} />
              <Info
                label={t("common.status")}
                value={getWorkspaceStatusLabel(selectedRecord, config, t, userDepartment)}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
          )}
        </Panel>
      )}
    </AdminDashboardLayout>
  );
}

function mergeFormData(app, next) {
  return {
    ...(app.form_data || {}),
    ...next,
  };
}

function getWorkspaceStatusLabel(app, config, t, userDepartment = "") {
  const status = normalizeStatus(app?.status);
  const isIklWorkspace = config?.key === "screening";
  const isDepartmentTechnicalWorkspace = config?.key === "technical";

  if (isIklWorkspace && status === "submitted") {
    return t("status.pt_ikl_review", "PT(IKL) Review");
  }

  if (isIklWorkspace && status === "ku_ikl_review") {
    return t("status.ku_ikl_review", "KU(IKL) Review");
  }

  if (isIklWorkspace && status === "technical_review_completed") {
    return t("status.technical_ku_review", "KU(IKL) Technical Review");
  }

  if (isIklWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return `${t(`status.${status}`, formatWorkflowStatus(status))}: ${TECHNICAL_DEPARTMENTS.join(" / ")}`;
  }

  if (isDepartmentTechnicalWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return getDepartmentReviewStatusLabel(userDepartment);
  }

  return formatWorkflowStatus(status);
}

function getWorkspaceActionDescription(config, t, userDepartment) {
  if (config?.key === "screening") {
    const copy = getIklScreeningCopy(userDepartment);
    return t(copy.actionDescriptionKey, copy.actionDescription);
  }

  return t(config.actionDescriptionKey, config.actionDescription);
}

function getDepartmentReviewStatusLabel(department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  return normalizedDepartment ? `${normalizedDepartment} Review` : "Department Review";
}

function getLocalizedApplicationType(app, t) {
  const type = getApplicationType(app);
  const normalizedType = String(type || "").trim().toLowerCase();
  const labelMap = {
    "application for site (new site)": "application.type.siteNew",
    "application for site": "application.type.site",
    "sitting application": "application.type.sitting",
    "signboard license": "application.type.signboard",
    "building plan": "application.type.buildingPlan",
  };

  return labelMap[normalizedType] ? t(labelMap[normalizedType], type) : type;
}

function buildIklScreeningPayload(app, data) {
  const now = new Date().toISOString();
  const checks = buildScreeningChecks(app);
  const reject =
    data.decision === "PT(IKL) Reject to Applicant" ||
    data.decision === "KU(IKL) Reject to Applicant";
  const technicalAmendment = data.decision === "Technical Amendment Required";
  const sendTechnical = data.decision === "KU(IKL) Confirm - Send to Technical Units";
  const correctionRequired = reject || technicalAmendment;

  return {
    status: reject
      ? "incomplete"
      : technicalAmendment
        ? "technical_amendment"
        : sendTechnical
          ? "technical_review"
          : "ku_ikl_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: correctionRequired ? data.comment : app.latest_remark || "",
    form_data: mergeFormData(app, {
      auto_screening: {
        status: "Screened",
        result: correctionRequired ? "Rejected to Applicant" : data.decision,
        remarks: data.comment,
        checks,
        checked_at: now,
      },
      correction_request: correctionRequired
        ? {
            source: data.decision.includes("KU") ? "KU(IKL)" : "PT(IKL)",
            remarks: data.comment,
            requested_at: now,
          }
        : app.form_data?.correction_request || null,
    }),
  };
}

function buildIklTechnicalDecisionPayload(app, data) {
  const now = new Date().toISOString();

  return {
    status: "technical_review_completed",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: data.comment || app.latest_remark || "",
    form_data: mergeFormData(app, {
      technical_review: {
        ...(app.form_data?.technical_review || {}),
        status: "Completed",
        final_decision: data.decision,
        decision: data.decision,
        comment: data.comment,
        department: "IKL (TECHNICAL)",
        reviewed_by: "PT/PO/KP Unit Iklan",
        reviewed_at: now,
        department_reviews: getTechnicalDepartmentReviews(app),
      },
      technical_site_visit: {
        ...(app.form_data?.technical_site_visit || {}),
        site_photos: data.technicalSite.site_photos || [],
        site_photo: data.technicalSite.site_photos?.[0] || null,
        license_fee_calculation: data.technicalSite.license_fee_calculation,
        deposit_calculation: data.technicalSite.deposit_calculation,
        site_remarks: data.technicalSite.site_remarks || data.comment,
        officer_role: "PT/PO/KP Unit Iklan",
        visited_at: now,
      },
      correction_request: null,
    }),
  };
}

function buildKuTechnicalReviewPayload(app, data) {
  const now = new Date().toISOString();
  const amendmentRequired = data.decision === "KU(IKL) Request Technical Amendment";

  return {
    status: amendmentRequired ? "technical_amendment" : "management_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: data.comment || app.latest_remark || "",
    form_data: mergeFormData(app, {
      technical_ku_review: {
        status: amendmentRequired ? "Amendment Required" : "Verified",
        decision: data.decision,
        remarks: data.comment,
        reviewed_by: "KU(IKL)",
        reviewed_at: now,
      },
      correction_request: amendmentRequired
        ? {
            source: "KU(IKL)",
            target: "PT/PO/KP Unit Iklan",
            remarks: data.comment,
            requested_at: now,
          }
        : null,
      kb_les_verification: amendmentRequired
        ? app.form_data?.kb_les_verification || null
        : {
            status: "Pending KB(LES) Verification",
            routed_from: "KU(IKL)",
            routed_at: now,
          },
    }),
  };
}

function buildDepartmentTechnicalReviewPayload(app, data) {
  const now = new Date().toISOString();
  const department = normalizeDepartmentCode(data.department);
  const currentReviews = getTechnicalDepartmentReviews(app);
  const nextReviews = {
    ...currentReviews,
    [department]: {
      department,
      decision: data.decision,
      remarks: data.comment,
      reviewed_at: now,
      reviewed_by: department,
    },
  };

  return {
    status: "technical_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    form_data: mergeFormData(app, {
      technical_department_reviews: nextReviews,
      technical_department_reviews_updated_at: now,
    }),
  };
}

function getTechnicalDepartmentReviews(app) {
  return (
    app?.technical_department_reviews ||
    app?.form_data?.technical_department_reviews ||
    {}
  );
}

function hasTechnicalDepartmentReview(app, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  return Boolean(getTechnicalDepartmentReviews(app)?.[normalizedDepartment]);
}

function areAllTechnicalDepartmentReviewsComplete(app) {
  return TECHNICAL_DEPARTMENTS.every((department) =>
    hasTechnicalDepartmentReview(app, department)
  );
}

function countBy(applications, predicate) {
  return applications.filter(predicate).length;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

function cleanRemark(value) {
  const remark = String(value || "").trim();
  return ["", "-", "[]"].includes(remark) ? "" : remark;
}

function normalizeDepartmentCode(value) {
  const department = String(value || "").trim().toUpperCase();
  if (department === "PT IKL") return "PT(IKL)";
  if (department === "KU IKL") return "KU(IKL)";
  if (
    department === "IKL(TECHNICAL)" ||
    department === "IKL TECHNICAL" ||
    department === "IKL-TECHNICAL"
  ) {
    return "IKL (TECHNICAL)";
  }
  if (department === "INP") return "LNP";
  return department === "UNIT IKLAN" ? "PT(IKL)" : department;
}

function canAccessWorkspace(config, department) {
  const allowedDepartments = config?.allowedDepartments;

  if (!Array.isArray(allowedDepartments) || allowedDepartments.length === 0) {
    return true;
  }

  return allowedDepartments.includes(department);
}

function getWorkspaceStatusScope(config, department) {
  if (config?.key === "screening") {
    return IKL_DEPARTMENT_STATUS_SCOPE[department] || [];
  }

  return Array.isArray(config?.statuses) ? config.statuses : [];
}

function hasAttachment(row) {
  return Boolean(row?.attachment || row?.file || row?.file_url || row?.url);
}

function hasCoordinates(step1) {
  const latitude = Number(step1.latitude);
  const longitude = Number(step1.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function isStepOneComplete(step1, app) {
  const requiredFields = [
    step1.project_name || app.title,
    step1.applicant,
    step1.contact_person,
    step1.tel_no,
    step1.locality_address,
    step1.area_required,
    step1.total_scheme_value,
    step1.amount_fund_approved,
    step1.amount_fund_available,
    step1.project_justification,
    step1.site_selection_reason,
    step1.designation,
    step1.officer_name,
    step1.application_date,
  ];

  return requiredFields.every(hasValue);
}

function areSupportingDocumentsComplete(app, step10) {
  const requiredDocuments = Array.isArray(step10.documents)
    ? step10.documents.filter((document) => document.required !== false)
    : [];
  const titleDocuments = Array.isArray(step10.title_documents)
    ? step10.title_documents
    : [];
  const otherDocuments = Array.isArray(step10.other_documents)
    ? step10.other_documents
    : [];
  const uploadedDocuments = Array.isArray(app.supporting_documents)
    ? app.supporting_documents
    : [];

  const requiredSectionComplete =
    requiredDocuments.length > 0 && requiredDocuments.every(hasAttachment);
  const titleSectionComplete =
    titleDocuments.length > 0 &&
    titleDocuments.every((document) => hasValue(document.land) && hasAttachment(document));
  const otherSectionComplete =
    otherDocuments.length === 0 ||
    otherDocuments.every((document) => !hasValue(document.description) || hasAttachment(document));

  return (
    (requiredSectionComplete && titleSectionComplete && otherSectionComplete) ||
    uploadedDocuments.length > 0
  );
}

const configs = {
  screening: {
    key: "screening",
    allowedDepartments: IKL_TASK_DEPARTMENTS,
    statuses: ["submitted", "incomplete", "ku_ikl_review", "technical_review", "technical_site_visit", "technical_amendment", "technical_review_completed"],
    eyebrow: "S2 Verification",
    eyebrowKey: "workspace.screening.eyebrow",
    title: "Application Screening",
    titleKey: "workspace.screening.title",
    description: "Review applicant information and documents. Reject with remarks if incomplete, or route complete applications to KU(IKL)/technical review.",
    descriptionKey: "workspace.screening.description",
    queueTitle: "Screening Queue",
    queueTitleKey: "workspace.screening.queue",
    actionDescription: "Record PT(IKL) or KU(IKL) decision for the selected application.",
    actionDescriptionKey: "workspace.screening.action",
    showDecision: true,
    showComment: true,
    showTechnicalSiteVisit: true,
    defaultDecision: "PT(IKL) Send to KU(IKL)",
    decisions: [
      { value: "PT(IKL) Send to KU(IKL)", labelKey: "workspace.decision.completeToKu" },
      { value: "KU(IKL) Confirm - Send to Technical Units", labelKey: "workspace.decision.kuToTechnical" },
      { value: "PT(IKL) Reject to Applicant", labelKey: "workspace.decision.rejectApplicant" },
      { value: "KU(IKL) Reject to Applicant", labelKey: "workspace.decision.kuRejectApplicant" },
      { value: "Technical Amendment Required", labelKey: "workspace.decision.technicalAmendment" },
    ],
    commentLabel: "Remarks",
    commentLabelKey: "workspace.comment.remarks",
    commentPlaceholder: "Enter PT(IKL) / KU(IKL) remarks. Required when rejecting.",
    commentPlaceholderKey: "workspace.comment.screeningPlaceholder",
    stats: (apps) => [
      { label: "Total", labelKey: "workspace.stat.total", value: apps.length, icon: "folder" },
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => ["submitted", "incomplete"].includes(normalizeStatus(app.status))), icon: "pending", tone: "amber" },
      { label: "Screened", labelKey: "workspace.stat.screened", value: countBy(apps, (app) => ["ku_ikl_review", "technical_review", "technical_site_visit", "technical_review_completed"].includes(normalizeStatus(app.status))), icon: "fact_check" },
      { label: "Passed", labelKey: "workspace.stat.passed", value: countBy(apps, (app) => ["ku_ikl_review", "technical_review", "technical_site_visit", "technical_review_completed"].includes(normalizeStatus(app.status))), icon: "task_alt" },
    ],
    screeningAction: {
      label: "Submit PT/KU Decision",
      labelKey: "workspace.action.submitScreening",
      icon: "fact_check",
      success: "Screening decision saved.",
      successKey: "workspace.message.screeningSaved",
      buildPayload: buildIklScreeningPayload,
    },
    technicalActions: [
      {
        label: "Supported",
        labelKey: "workspace.decision.supported",
        icon: "thumb_up",
        decision: "Supported",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
      },
      {
        label: "Supported with Conditions",
        labelKey: "workspace.decision.supportedConditions",
        icon: "rule",
        variant: "secondary",
        decision: "Supported with Conditions",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
      },
      {
        label: "Not Supported",
        labelKey: "workspace.decision.notSupported",
        icon: "thumb_down",
        variant: "danger",
        decision: "Not Supported",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
      },
    ],
    kuTechnicalReview: {
      defaultDecision: "KU(IKL) Confirm - Send to KB(LES)",
      decisions: [
        { value: "KU(IKL) Confirm - Send to KB(LES)", labelKey: "workspace.decision.kuConfirmToKb" },
        { value: "KU(IKL) Request Technical Amendment", labelKey: "workspace.decision.kuRequestTechnicalAmendment" },
      ],
      action: {
        label: "Submit KU(IKL) Review",
        labelKey: "workspace.action.submitKuTechnicalReview",
        icon: "verified",
        requiresComment: true,
        success: "KU(IKL) technical review saved.",
        successKey: "workspace.message.kuTechnicalReviewSaved",
        buildPayload: buildKuTechnicalReviewPayload,
      },
    },
    actions: [],
  },
  technical: {
    key: "technical",
    allowedDepartments: ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"],
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    eyebrow: "Parallel Review",
    eyebrowKey: "workspace.technical.eyebrow",
    title: "Technical Review",
    titleKey: "workspace.technical.title",
    description: "Record department site visit decision and remarks for IKL review.",
    descriptionKey: "workspace.technical.description",
    queueTitle: "Technical Queue",
    queueTitleKey: "workspace.technical.queue",
    actionDescription: "Enter department decision and site finding remarks.",
    actionDescriptionKey: "workspace.technical.action",
    showDecision: true,
    showComment: true,
    showTechnicalSiteVisit: false,
    defaultDecision: "Supported",
    decisions: [
      { value: "Supported", labelKey: "workspace.decision.supported" },
      { value: "Supported with Conditions", labelKey: "workspace.decision.supportedConditions" },
      { value: "Not Supported", labelKey: "workspace.decision.notSupported" },
    ],
    commentLabel: "Remarks",
    commentLabelKey: "workspace.comment.technical",
    commentPlaceholder: "Add department comments, conditions, site notes, or rejection reasons.",
    commentPlaceholderKey: "workspace.comment.technicalPlaceholder",
    stats: (apps, department) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !hasTechnicalDepartmentReview(app, department)), icon: "pending", tone: "amber" },
      { label: "Completed", labelKey: "workspace.stat.completed", value: countBy(apps, (app) => hasTechnicalDepartmentReview(app, department)), icon: "task_alt" },
      { label: "Supported", labelKey: "workspace.stat.supported", value: countBy(apps, (app) => getTechnicalDepartmentReviews(app)?.[department]?.decision === "Supported"), icon: "thumb_up" },
      { label: "Not Supported", labelKey: "workspace.stat.notSupported", value: countBy(apps, (app) => getTechnicalDepartmentReviews(app)?.[department]?.decision === "Not Supported"), icon: "thumb_down", tone: "red" },
    ],
    actions: [
      {
        label: "Submit",
        labelKey: "common.submit",
        icon: "send",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildDepartmentTechnicalReviewPayload,
      },
    ],
  },
  approval: {
    key: "approval",
    eyebrow: "Management and MPHLG",
    eyebrowKey: "workspace.approval.eyebrow",
    statuses: ["management_review", "mphlg_processing", "mphlg_decision_received"],
    title: "Approval",
    titleKey: "workspace.approval.title",
    description: "Record KB(LES) verification, TP/PGH recommendation, MPHLG/SUT review, and final decision.",
    descriptionKey: "workspace.approval.description",
    queueTitle: "Approval Queue",
    queueTitleKey: "workspace.approval.queue",
    actionDescription: "Submit approval decision or remarks.",
    actionDescriptionKey: "workspace.approval.action",
    showDecision: true,
    showComment: true,
    defaultDecision: "Approved",
    decisions: [
      { value: "Approved", labelKey: "workspace.decision.approved" },
      { value: "Approved with Conditions", labelKey: "workspace.decision.approvedConditions" },
      { value: "Rejected", labelKey: "workspace.decision.rejected" },
    ],
    commentLabel: "Approval Notes",
    commentLabelKey: "workspace.comment.approval",
    stats: (apps) => [
      { label: "Awaiting", labelKey: "workspace.stat.awaiting", value: countBy(apps, (app) => !app.form_data?.approval), icon: "pending", tone: "amber" },
      { label: "Approved", labelKey: "workspace.stat.approved", value: countBy(apps, (app) => normalizeStatus(app.status) === "approved"), icon: "task_alt" },
      { label: "Conditional", labelKey: "workspace.stat.conditional", value: countBy(apps, (app) => normalizeStatus(app.status) === "approved_with_conditions"), icon: "rule", tone: "blue" },
      { label: "Rejected", labelKey: "workspace.stat.rejected", value: countBy(apps, (app) => normalizeStatus(app.status) === "rejected"), icon: "cancel", tone: "red" },
    ],
    actions: [
      {
        label: "Submit Decision",
        labelKey: "workspace.action.submitDecision",
        icon: "approval_delegation",
        requiresComment: true,
        success: "Final decision saved.",
        successKey: "workspace.message.decisionSaved",
        buildPayload: (app, data) => {
          const status =
            data.decision === "Rejected"
              ? "rejected"
              : data.decision === "Approved with Conditions"
                ? "approved_with_conditions"
                : "approved";
          return {
            status,
            current_step: Math.max(Number(app.current_step || 1), 5),
            form_data: mergeFormData(app, {
              licensing_verification: {
                officer: "KB(LES)",
                status: "Verified",
                remarks: data.comment,
                verified_at: new Date().toISOString(),
              },
              management_recommendation: {
                status: "Completed",
                officer: "TP(RES) / PGH",
                signed_at: new Date().toISOString(),
              },
              mphlg_gateway: {
                status: "MPHLG / SUT Decision Received",
                received_at: new Date().toISOString(),
              },
              approval: {
                status: "Completed",
                final_decision: data.decision,
                notes: data.comment,
                approved_at: new Date().toISOString(),
              },
            }),
          };
        },
      },
    ],
  },
  payment: {
    eyebrow: "Payment",
    eyebrowKey: "workspace.payment.eyebrow",
    title: "Invoice and Payment",
    titleKey: "workspace.payment.title",
    description: "Generate invoices and verify uploaded payment receipt proof.",
    descriptionKey: "workspace.payment.description",
    queueTitle: "Payment Queue",
    queueTitleKey: "workspace.payment.queue",
    actionDescription: "Generate an invoice, then verify whether the uploaded receipt is valid or fake.",
    actionDescriptionKey: "workspace.payment.action",
    showComment: true,
    commentLabel: "Receipt Verification Notes",
    commentLabelKey: "workspace.comment.payment",
    commentPlaceholder: "Add verification notes, receipt issues, or rejection reason.",
    commentPlaceholderKey: "workspace.comment.paymentPlaceholder",
    stats: (apps) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !app.form_data?.payment), icon: "pending", tone: "amber" },
      { label: "Invoiced", labelKey: "workspace.stat.invoiced", value: countBy(apps, (app) => normalizeStatus(app.status) === "invoice_generated"), icon: "receipt_long", tone: "blue" },
      { label: "Submitted", labelKey: "workspace.stat.submitted", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_submitted"), icon: "payments" },
      { label: "Verified", labelKey: "workspace.stat.verified", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_verified"), icon: "verified" },
    ],
    actions: [
      {
        label: "Generate Invoice",
        labelKey: "workspace.action.generateInvoice",
        icon: "receipt_long",
        success: "Invoice generated.",
        successKey: "workspace.message.invoiceGenerated",
        buildPayload: (app) => ({
          status: "invoice_generated",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              invoice_no: getInvoiceNo(app),
              amount: app.form_data?.payment?.amount || 250,
              status: "Invoice Generated",
              generated_by: "PT(IKL)",
              verified_by: "KU(IKL)",
              generated_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Verify Receipt",
        labelKey: "workspace.action.verifyPayment",
        icon: "verified",
        success: "Payment verified.",
        successKey: "workspace.message.paymentVerified",
        requiresReceipt: true,
        requiresSubmittedReceipt: true,
        buildPayload: (app, data) => ({
          status: "payment_verified",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Payment Verified",
              verification_result: "Valid",
              verification_notes: data.comment,
              verified_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Reject Receipt",
        labelKey: "workspace.action.rejectReceipt",
        icon: "report",
        variant: "danger",
        requiresComment: true,
        requiresReceipt: true,
        requiresSubmittedReceipt: true,
        success: "Receipt rejected. Applicant can upload a new receipt.",
        successKey: "workspace.message.receiptRejected",
        buildPayload: (app, data) => ({
          status: "invoice_generated",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Receipt Rejected",
              verification_result: "Invalid/Fake",
              verification_notes: data.comment,
              rejected_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
    details: PaymentDetails,
  },
  license: {
    eyebrow: "Completion",
    eyebrowKey: "workspace.license.eyebrow",
    title: "E-License and QR",
    titleKey: "workspace.license.title",
    description: "Generate QR e-license, monitor expiry, and issue renewal reminders.",
    descriptionKey: "workspace.license.description",
    queueTitle: "License Queue",
    queueTitleKey: "workspace.license.queue",
    actionDescription: "Issue, revoke, or monitor the digital license.",
    actionDescriptionKey: "workspace.license.action",
    showComment: false,
    stats: (apps) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => normalizeStatus(app.status) !== "license_issued"), icon: "pending", tone: "amber" },
      { label: "Issued", labelKey: "workspace.stat.issued", value: countBy(apps, (app) => normalizeStatus(app.status) === "license_issued"), icon: "qr_code_2" },
      { label: "Revoked", labelKey: "workspace.stat.revoked", value: countBy(apps, (app) => normalizeStatus(app.status) === "license_revoked"), icon: "block", tone: "red" },
      { label: "Active", labelKey: "workspace.stat.active", value: countBy(apps, (app) => app.form_data?.license?.status === "Active"), icon: "verified" },
    ],
    actions: [
      {
        label: "Issue License",
        labelKey: "workspace.action.issueLicense",
        icon: "qr_code_2",
        success: "E-license issued.",
        successKey: "workspace.message.licenseIssued",
        buildPayload: (app) => {
          const today = new Date();
          const expiry = new Date(today);
          expiry.setFullYear(today.getFullYear() + 1);
          const licenseId = getLicenseId(app);
          return {
            status: "license_issued",
            form_data: mergeFormData(app, {
              license: {
                license_id: licenseId,
                status: "Active",
                holder: getApplicantName(app),
                type: getApplicationType(app),
                location: getApplicationLocation(app),
                issue_date: today.toISOString(),
                expiry_date: expiry.toISOString(),
                verification_url: `${window.location.origin}/license/verify/${licenseId}`,
                issued_at: new Date().toISOString(),
                renewal_reminders: [
                  { months_before_expiry: 3, status: "Scheduled" },
                  { months_before_expiry: 2, status: "Scheduled" },
                  { months_before_expiry: 1, status: "Scheduled" },
                ],
              },
            }),
          };
        },
      },
      {
        label: "Revoke",
        labelKey: "workspace.action.revoke",
        icon: "block",
        variant: "danger",
        success: "License revoked.",
        successKey: "workspace.message.licenseRevoked",
        buildPayload: (app) => ({
          status: "license_revoked",
          form_data: mergeFormData(app, {
            license: {
              ...(app.form_data?.license || {}),
              status: "Revoked",
              revoked_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
    details: LicenseDetails,
  },
};

function buildScreeningChecks(app) {
  const form = app.form_data || {};
  const step1 = form.step_1 || {};
  const step10 = form.step_10 || {};
  const step11 = form.step_11 || {};
  const stepOneComplete = isStepOneComplete(step1, app);
  const locationComplete =
    hasValue(step1.locality_address) &&
    hasValue(step1.map_address) &&
    hasCoordinates(step1);
  const documentsComplete = areSupportingDocumentsComplete(app, step10);
  const declarationComplete =
    Boolean(step11.agreed && step11.submitted) ||
    normalizeStatus(app.status) !== "draft";

  return [
    {
      label: "Application form",
      labelKey: "workspace.check.applicationForm",
      result: stepOneComplete ? "Passed" : "Failed",
      resultKey: stepOneComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
    {
      label: "GIS / location",
      labelKey: "workspace.check.location",
      result: locationComplete ? "Passed" : "Failed",
      resultKey: locationComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
    {
      label: "Supporting documents",
      labelKey: "workspace.check.supportingDocuments",
      result: documentsComplete ? "Passed" : "Failed",
      resultKey: documentsComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
    {
      label: "Applicant declaration",
      labelKey: "workspace.check.declaration",
      result: declarationComplete ? "Passed" : "Failed",
      resultKey: declarationComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
  ];
}

function IklWorkspaceSections({
  t,
  config,
  selectedRecord,
  decision,
  setDecision,
  comment,
  setComment,
  technicalSite,
  setTechnicalSite,
  saving,
  submitAction,
  userDepartment,
}) {
  const status = normalizeStatus(selectedRecord.status);
  const allDepartmentReviewsComplete = areAllTechnicalDepartmentReviewsComplete(selectedRecord);
  const showScreeningDecision = ["submitted", "incomplete", "ku_ikl_review"].includes(status);
  const showTechnicalFinalDecision = [
    "technical_review",
    "technical_site_visit",
    "technical_amendment",
  ].includes(status);
  const showKuTechnicalReview = status === "technical_review_completed";
  const showTechnicalDepartmentRemarks =
    userDepartment === "IKL (TECHNICAL)" || showKuTechnicalReview;
  const [kuDecision, setKuDecision] = useState(
    config.kuTechnicalReview?.defaultDecision || ""
  );
  const [kuRemarks, setKuRemarks] = useState("");
  const screeningDecisionOptions = getIklScreeningDecisionOptions(
    config.decisions,
    userDepartment
  );
  const screeningCopy = getIklScreeningCopy(userDepartment);

  useEffect(() => {
    const hasDecision = screeningDecisionOptions.some(
      (item) => (item.value || item) === decision
    );
    if (!hasDecision && screeningDecisionOptions.length > 0) {
      setDecision(screeningDecisionOptions[0].value || screeningDecisionOptions[0]);
    }
  }, [decision, screeningDecisionOptions, setDecision]);

  async function handleSitePhotoUpload(files) {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;

    const sitePhotos = await Promise.all(
      fileList.map((file) =>
        uploadApplicationDocument(
          selectedRecord.id,
          "Technical Site Photo",
          file
        )
      )
    );

    setTechnicalSite((prev) => ({
      ...prev,
      site_photos: [...(prev.site_photos || []), ...sitePhotos],
    }));
  }

  return (
    <div className="space-y-4">
      {showScreeningDecision && (
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3">
            <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
              {t(screeningCopy.titleKey, screeningCopy.title)}
            </h3>
            <p className="mt-1 text-[14px] leading-5 text-slate-500">
              {t(screeningCopy.descriptionKey, screeningCopy.description)}
            </p>
          </div>

          <div className="space-y-3">
            <Field label={t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Decision")}>
              <select
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
                className={`form-input ${["PT(IKL)", "KU(IKL)"].includes(userDepartment) ? "max-w-64" : ""}`}
              >
                {screeningDecisionOptions.map((item) => (
                  <option key={item.value || item} value={item.value || item}>
                    {getIklScreeningDecisionLabel(item, userDepartment, t)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t(config.commentLabelKey, config.commentLabel || "Notes")}>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows="4"
                className="form-input"
                placeholder={t(screeningCopy.placeholderKey, screeningCopy.placeholder)}
              />
            </Field>

            <div className="flex justify-end">
              <Button
                icon="fact_check"
                disabled={saving}
                onClick={() => submitAction(config.screeningAction)}
                className="w-full sm:w-auto"
              >
                {saving
                  ? t("workspace.saving")
                  : t(screeningCopy.submitKey, screeningCopy.submitLabel)}
              </Button>
            </div>
          </div>
        </section>
      )}

      {showTechnicalFinalDecision && (
        <section className="space-y-3">
          <TechnicalSiteVisitFields
            t={t}
            applicationId={selectedRecord.id}
            value={technicalSite}
            onChange={setTechnicalSite}
            onFileChange={handleSitePhotoUpload}
          />

          {!allDepartmentReviewsComplete && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] font-medium leading-5 text-amber-800">
              {t("workspace.technical.awaitingDepartmentReviews")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {config.technicalActions.map((action) => (
              <Button
                key={action.label}
                onClick={() =>
                  submitAction(action, {
                    comment: technicalSite.site_remarks,
                    checkDecisionRemark: true,
                  })
                }
                disabled={saving || !allDepartmentReviewsComplete}
                variant={action.variant || "primary"}
                icon={action.icon}
                className="w-full"
              >
                {saving ? t("workspace.saving") : t(action.labelKey, action.label)}
              </Button>
            ))}
          </div>
        </section>
      )}

      {showKuTechnicalReview && config.kuTechnicalReview && (
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3">
            <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
              {t("workspace.technical.kuReviewTitle")}
            </h3>
            <p className="mt-1 text-[14px] leading-5 text-slate-500">
              {t("workspace.technical.kuReviewDesc")}
            </p>
          </div>

          <div className="space-y-3">
            <Field label={t("common.decision")}>
              <select
                value={kuDecision}
                onChange={(event) => setKuDecision(event.target.value)}
                className="form-input"
              >
                {config.kuTechnicalReview.decisions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.labelKey, item.value)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("workspace.comment.remarks")}>
              <textarea
                value={kuRemarks}
                onChange={(event) => setKuRemarks(event.target.value)}
                rows="4"
                className="form-input"
                placeholder={t("workspace.technical.kuReviewPlaceholder")}
              />
            </Field>

            <div className="flex justify-end">
              <Button
                icon={config.kuTechnicalReview.action.icon}
                disabled={saving}
                onClick={() =>
                  submitAction(config.kuTechnicalReview.action, {
                    decision: kuDecision,
                    comment: kuRemarks,
                    checkDecisionRemark: true,
                  })
                }
                className="w-full sm:w-auto"
              >
                {saving
                  ? t("workspace.saving")
                  : t(
                      config.kuTechnicalReview.action.labelKey,
                      config.kuTechnicalReview.action.label
                    )}
              </Button>
            </div>
          </div>
        </section>
      )}

      {showTechnicalDepartmentRemarks && (
        <TechnicalDepartmentRemarks app={selectedRecord} t={t} />
      )}
    </div>
  );
}

function getIklScreeningCopy(department) {
  if (department === "PT(IKL)") {
    return {
      actionDescriptionKey: "workspace.screening.actionPt",
      actionDescription: "Record PT(IKL) decision for the selected application.",
      titleKey: "workspace.ikl.ptScreeningTitle",
      title: "PT(IKL) Verification",
      descriptionKey: "workspace.ikl.ptScreeningDesc",
      description: "Review applicant information and documents, then send the application onward or reject it with remarks.",
      placeholderKey: "workspace.comment.ptScreeningPlaceholder",
      placeholder: "Required when rejecting.",
      submitKey: "common.submit",
      submitLabel: "Submit",
    };
  }

  if (department === "KU(IKL)") {
    return {
      actionDescriptionKey: "workspace.screening.actionKu",
      actionDescription: "Record KU(IKL) decision for the selected application.",
      titleKey: "workspace.ikl.kuScreeningTitle",
      title: "KU(IKL) Verification",
      descriptionKey: "workspace.ikl.kuScreeningDesc",
      description: "Review the screening result, then send the application to technical review or reject it with remarks.",
      placeholderKey: "workspace.comment.kuScreeningPlaceholder",
      placeholder: "Required when rejecting.",
      submitKey: "common.submit",
      submitLabel: "Submit",
    };
  }

  return {
    actionDescriptionKey: "workspace.screening.action",
    actionDescription: "Record PT(IKL) or KU(IKL) decision for the selected application.",
    titleKey: "workspace.ikl.screeningTitle",
    title: "PT(IKL) / KU(IKL) Verification",
    descriptionKey: "workspace.ikl.screeningDesc",
    description: "Use this section to send to KU(IKL), send to technical review, or reject to the applicant with remarks.",
    placeholderKey: "workspace.comment.screeningPlaceholder",
    placeholder: "Enter PT(IKL) / KU(IKL) remarks. Required when rejecting.",
    submitKey: "workspace.action.submitScreening",
    submitLabel: "Submit PT/KU Decision",
  };
}

function TechnicalDepartmentRemarks({ app, t }) {
  const reviews = getTechnicalDepartmentReviews(app);

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.compiledRemarksTitle")}
        </h3>
        <p className="mt-1 text-[14px] leading-5 text-slate-500">
          {t("workspace.technical.compiledRemarksDesc")}
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        <div className="hidden grid-cols-1 gap-4 bg-slate-50 px-3 py-2 text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500 md:grid md:grid-cols-[110px_210px_1fr]">
          <div>{t("common.department", "Department")}</div>
          <div>{t("common.status", "Status")}</div>
          <div>{t("workspace.comment.remarks", "Remarks")}</div>
        </div>
        {TECHNICAL_DEPARTMENTS.map((department) => {
          const review = reviews?.[department];

          return (
            <div key={department} className="grid grid-cols-1 gap-4 px-3 py-2 text-[14px] leading-5 md:grid-cols-[110px_210px_1fr]">
              <div className="font-semibold text-slate-950">{department}</div>
              <div>
                <StatusPill
                  value={
                    review?.decision
                      ? t(getDecisionLabelKey(review.decision), review.decision)
                      : t("workspace.stat.pending")
                  }
                />
              </div>
              <div className="min-w-0 text-slate-700">
                {review?.remarks ? (
                  <>
                    <p className="whitespace-pre-wrap leading-5">{review.remarks}</p>
                    <p className="mt-1 text-[13px] leading-5 text-slate-400">
                      {formatDateTime(review.reviewed_at)}
                    </p>
                  </>
                ) : (
                  <span className="text-slate-400">{t("workspace.info.notSubmitted")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDecisionLabelKey(value) {
  const map = {
    Supported: "workspace.decision.supported",
    "Supported with Conditions": "workspace.decision.supportedConditions",
    "Not Supported": "workspace.decision.notSupported",
    "Requires Amendment": "workspace.decision.requiresAmendment",
  };

  return map[value] || value;
}

function getIklScreeningDecisionLabel(item, department, t) {
  const value = item.value || item;

  if (department === "PT(IKL)") {
    if (value === "PT(IKL) Send to KU(IKL)") {
      return t("workspace.decision.approve", "Approve");
    }

    if (value === "PT(IKL) Reject to Applicant") {
      return t("workspace.decision.reject", "Reject");
    }
  }

  if (department === "KU(IKL)") {
    if (value === "KU(IKL) Confirm - Send to Technical Units") {
      return t("workspace.decision.approve", "Approve");
    }

    if (value === "KU(IKL) Reject to Applicant") {
      return t("workspace.decision.reject", "Reject");
    }
  }

  return t(item.labelKey, item.label || item);
}

function getIklScreeningDecisionOptions(decisions, department) {
  const allowed = {
    "PT(IKL)": new Set([
      "PT(IKL) Send to KU(IKL)",
      "PT(IKL) Reject to Applicant",
    ]),
    "KU(IKL)": new Set([
      "KU(IKL) Confirm - Send to Technical Units",
      "KU(IKL) Reject to Applicant",
    ]),
  }[department];

  if (!allowed) return decisions;

  return decisions.filter((item) => allowed.has(item.value || item));
}

function TechnicalSiteVisitFields({ t, applicationId, value, onChange, onFileChange }) {
  const sitePhotos = Array.isArray(value.site_photos) ? value.site_photos : [];
  const [deletingIndex, setDeletingIndex] = useState(null);

  function updateField(field, nextValue) {
    onChange((prev) => ({ ...prev, [field]: nextValue }));
  }

  async function removePhoto(photo, index) {
    try {
      setDeletingIndex(index);

      if (photo?.document_id) {
        await deleteApplicationDocument(applicationId, photo.document_id);
      }

      onChange((prev) => ({
        ...prev,
        site_photos: (prev.site_photos || []).filter((_, itemIndex) => itemIndex !== index),
      }));
    } finally {
      setDeletingIndex(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
      <div>
        <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.siteVisitTitle")}
        </h3>
        <p className="mt-1 text-[14px] leading-5 text-slate-600">
          {t("workspace.technical.siteVisitDesc")}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[14px] font-semibold leading-5 text-slate-700">
          {t("workspace.technical.sitePhoto")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[14px] font-semibold leading-5 text-white hover:bg-emerald-800">
            <span className="material-symbols-outlined mr-1 text-base">
              add_photo_alternate
            </span>
            {t("workspace.technical.uploadSitePhoto")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                onFileChange(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {sitePhotos.length > 0 && (
            <span className="text-[14px] font-medium leading-5 text-emerald-700">
              {t("workspace.technical.sitePhotoUploaded")}: {sitePhotos.length}
            </span>
          )}
        </div>
      </div>

      {sitePhotos.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sitePhotos.map((photo, index) => (
            <div key={`${photo.name || "site-photo"}-${index}`} className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <SitePhotoPreview
                photo={photo}
                applicationId={applicationId}
                alt={`${t("workspace.technical.sitePhoto")} ${index + 1}`}
              />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate text-[14px] font-medium leading-5 text-slate-600">
                  {photo.name || `${t("workspace.technical.sitePhoto")} ${index + 1}`}
                </span>
                <SitePhotoActions
                  photo={photo}
                  applicationId={applicationId}
                  disabled={deletingIndex === index}
                  onRemove={() => removePhoto(photo, index)}
                  labels={{
                    view: t("common.view"),
                    download: t("common.download"),
                    delete: t("common.delete"),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
        <Field label={t("workspace.technical.licenseFee")} className="min-w-0">
          <input
            value={value.license_fee_calculation}
            onChange={(event) => updateField("license_fee_calculation", event.target.value)}
            className="form-input min-h-9"
            inputMode="decimal"
          />
        </Field>
        <Field label={t("workspace.technical.deposit")} className="min-w-0">
          <input
            value={value.deposit_calculation}
            onChange={(event) => updateField("deposit_calculation", event.target.value)}
            className="form-input min-h-9"
            inputMode="decimal"
          />
        </Field>
      </div>

      <Field label={t("workspace.technical.siteRemarks")}>
        <textarea
          value={value.site_remarks}
          onChange={(event) => updateField("site_remarks", event.target.value)}
          rows="4"
          className="form-input"
          placeholder={t("workspace.technical.siteRemarksPlaceholder")}
        />
      </Field>
    </div>
  );
}

function getSitePhotoSource(photo, applicationId) {
  return (
    photo?.dataUrl ||
    photo?.url ||
    photo?.file_url ||
    (photo?.document_id ? getApplicationDocumentUrl(applicationId, photo.document_id) : "")
  );
}

async function getSitePhotoBlobUrl(photo, applicationId) {
  const source = getSitePhotoSource(photo, applicationId);
  if (!source) return { url: "", revoke: false };

  if (source.startsWith("blob:")) return { url: source, revoke: false };

  const blob = await fetchAuthenticatedBlob(source);
  return { url: URL.createObjectURL(blob), revoke: true };
}

function SitePhotoActions({ photo, applicationId, disabled, onRemove, labels }) {
  async function viewPhoto() {
    const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);

    if (!url) return;

    window.open(url, "_blank", "noopener,noreferrer");

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  async function downloadPhoto() {
    const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);
    if (!url) return;

    const link = document.createElement("a");
    link.href = url;
    link.download = photo?.name || "site-photo";
    document.body.appendChild(link);
    link.click();
    link.remove();

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  const actions = [
    { icon: "visibility", label: labels.view, onClick: viewPhoto },
    { icon: "download", label: labels.download, onClick: downloadPhoto },
    { icon: "delete", label: labels.delete, onClick: onRemove, danger: true },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1">
      {actions.map((action) => (
        <button
          key={action.icon}
          type="button"
          title={action.label}
          aria-label={action.label}
          disabled={disabled}
          onClick={action.onClick}
          className={`material-symbols-outlined rounded p-1 text-[18px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
            action.danger
              ? "text-red-600 hover:bg-red-50 hover:text-red-700"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          }`}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}

function SitePhotoPreview({ photo, applicationId, alt }) {
  const source = getSitePhotoSource(photo, applicationId);
  const isInlinePreview =
    typeof source === "string" &&
    (source.startsWith("blob:") || source.startsWith("data:"));
  const [remotePreview, setRemotePreview] = useState({
    source: "",
    url: "",
    error: false,
  });
  const displayPreview = isInlinePreview
    ? source
    : remotePreview.source === source
      ? remotePreview.url
      : "";

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    if (!source || isInlinePreview) {
      return undefined;
    }

    fetchAuthenticatedBlob(source)
      .then((blob) => {
        if (!isActive) return;
        objectUrl = URL.createObjectURL(blob);
        setRemotePreview({ source, url: objectUrl, error: false });
      })
      .catch((error) => {
        console.error("Failed to load site visit photo preview:", error);
        if (isActive) {
          setRemotePreview({ source, url: "", error: true });
        }
      });

    return () => {
      isActive = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isInlinePreview, source]);

  if (!source) {
    return <div className="h-32 bg-slate-50" />;
  }

  if (displayPreview) {
    return (
      <img
        src={displayPreview}
        alt={alt}
        className="h-32 w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-32 items-center justify-center bg-slate-50 px-3 text-center text-xs text-slate-500">
      {remotePreview.error ? "Site photo could not be loaded." : "Loading site photo..."}
    </div>
  );
}

function PaymentDetails({ app, t }) {
  const payment = app.form_data?.payment || {};
  const receiptFile = payment.receipt_file;
  return (
    <div className="grid grid-cols-1 gap-3 text-sm">
      <Info label={t("common.invoice")} value={payment.invoice_no || getInvoiceNo(app)} />
      <Info label={t("common.amount")} value={formatCurrency(payment.amount || 250)} />
      <Info label={t("common.status")} value={payment.status || t("workspace.info.notGenerated")} />
      <Info label={t("workspace.info.receipt")} value={receiptFile?.name || payment.receipt_reference || t("workspace.info.notSubmitted")} />
      {(receiptFile?.url || receiptFile?.file_url || receiptFile?.dataUrl) && (
        <a
          href={receiptFile.url || receiptFile.file_url || receiptFile.dataUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <span className="material-symbols-outlined text-base">visibility</span>
          {t("workspace.info.viewReceipt")}
        </a>
      )}
      {payment.verification_result && (
        <Info label={t("workspace.info.verificationResult")} value={payment.verification_result} />
      )}
      {payment.verification_notes && (
        <Info label={t("workspace.info.verificationNotes")} value={payment.verification_notes} />
      )}
    </div>
  );
}

function LicenseDetails({ app, t }) {
  const license = app.form_data?.license || {};
  return (
    <div className="grid grid-cols-1 gap-3 text-sm">
      <Info label={t("workspace.info.licenseId")} value={license.license_id || getLicenseId(app)} />
      <Info label={t("common.status")} value={license.status || t("workspace.info.pendingIssuance")} />
      <Info label={t("workspace.info.expiry")} value={formatDate(license.expiry_date)} />
      <Info label={t("workspace.info.verificationUrl")} value={license.verification_url || t("workspace.info.notGenerated")} />
    </div>
  );
}

export default ProcessWorkspace;

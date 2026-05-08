import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";
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

function ProcessWorkspace({ type }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const config = configs[type];
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState("");
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
    site_photo: null,
    license_fee_calculation: "",
    deposit_calculation: "",
    site_remarks: "",
  });

  useEffect(() => {
    fetchApplications();
  }, []);

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
    setTechnicalSite({
      site_photo: saved.site_photo || null,
      license_fee_calculation: saved.license_fee_calculation || "",
      deposit_calculation: saved.deposit_calculation || "",
      site_remarks: saved.site_remarks || saved.site_photo_note || "",
    });
  }, [selectedDetail?.id, selectedDetail?.updated_at]);

  async function fetchApplications() {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
      if (!selectedId && list.length > 0) setSelectedId(String(list[0].id));
    } catch (err) {
      setError(err.message || "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return applications.filter((app) => {
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
  }, [applications, keyword]);

  const selected = useMemo(() => {
    return applications.find((app) => String(app.id) === String(selectedId)) || filtered[0] || null;
  }, [applications, filtered, selectedId]);
  const selectedRecord =
    selectedDetail && String(selectedDetail.id) === String(selected?.id)
      ? { ...selected, ...selectedDetail }
      : selected;

  const stats = useMemo(() => config.stats(applications), [applications, config]);

  async function submitAction(action) {
    if (!selectedRecord?.id) {
      setError("Please select an application first.");
      return;
    }

    if (action.requiresComment && !comment.trim()) {
      setError("Please enter notes or comments first.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const current = await apiRequest(`/applications/${selectedRecord.id}/`);
      const body = action.buildPayload(current, { decision, comment, technicalSite });

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

      <Alert message={error} />
      <Alert type="success" message={success} />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {stats.map((item) => (
          <StatCard key={item.labelKey || item.label} {...item} label={t(item.labelKey, item.label)} />
        ))}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
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
                render: (app) => <StatusPill value={formatWorkflowStatus(app.status)} />,
              },
              {
                key: "updated",
                label: t("common.updated"),
                render: (app) => formatDate(app.updated_at),
              },
            ]}
          />
        </Panel>

        <Panel title={t("workspace.actionPanel")} description={t(config.actionDescriptionKey, config.actionDescription)}>
          {!selectedRecord ? (
            <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
          ) : (
            <div className="space-y-4">
              <ApplicationSummary
                app={selectedRecord}
                labels={{
                  selectedApplication: t("workspace.selectedApplication"),
                  defaultTitle: t("workspace.defaultApplicationTitle"),
                  created: t("workspace.created"),
                  updated: t("common.updated"),
                  step: t("workspace.step"),
                }}
              />

              {config.showDecision && (
                <Field label={t(config.decisionLabelKey, config.decisionLabel || "Decision")}>
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

              {config.showTechnicalSiteVisit && (
                <TechnicalSiteVisitFields
                  t={t}
                  value={technicalSite}
                  onChange={setTechnicalSite}
                  onFileChange={async (file) => {
                    if (!file) return;
                    const sitePhoto = await readFileAsDataUrl(file);
                    setTechnicalSite((prev) => ({ ...prev, site_photo: sitePhoto }));
                  }}
                />
              )}

              {detailLoading ? (
                <p className="text-sm text-slate-500">{t("common.loadingSelectedApplication")}</p>
              ) : (
                config.details && <config.details app={selectedRecord} t={t} />
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/admin/applications/${selectedRecord.id}`)}
                >
                  {t("workspace.openForm")}
                </Button>
                {config.actions.map((action) => (
                  <Button
                    key={action.label}
                    onClick={() => submitAction(action)}
                    disabled={saving}
                    variant={action.variant || "primary"}
                    icon={action.icon}
                  >
                    {saving ? t("workspace.saving") : t(action.labelKey, action.label)}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>

      <Panel title={t("workspace.selectedRecord")} description={t("workspace.selectedRecordDesc")}>
        {selectedRecord ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Info label={t("common.reference")} value={getApplicationReference(selectedRecord)} />
            <Info label={t("common.applicant")} value={getApplicantName(selectedRecord)} />
            <Info label={t("common.type")} value={getApplicationType(selectedRecord)} />
            <Info label={t("common.project")} value={getProjectName(selectedRecord)} />
            <Info label={t("workspace.location")} value={getApplicationLocation(selectedRecord)} />
            <Info label={t("common.status")} value={formatWorkflowStatus(selectedRecord.status)} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
        )}
      </Panel>
    </AdminDashboardLayout>
  );
}

function mergeFormData(app, next) {
  return {
    ...(app.form_data || {}),
    ...next,
  };
}

function countBy(applications, predicate) {
  return applications.filter(predicate).length;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        dataUrl: reader.result,
      });
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
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
    defaultDecision: "Complete - Send to KU(IKL)",
    decisions: [
      { value: "Complete - Send to KU(IKL)", labelKey: "workspace.decision.completeToKu" },
      { value: "KU(IKL) Confirm - Send to Technical Units", labelKey: "workspace.decision.kuToTechnical" },
      { value: "Reject to Applicant", labelKey: "workspace.decision.rejectApplicant" },
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
    actions: [
      {
        label: "Submit Screening Decision",
        labelKey: "workspace.action.submitScreening",
        icon: "fact_check",
        success: "Screening decision saved.",
        successKey: "workspace.message.screeningSaved",
        buildPayload: (app, data) => {
          const checks = buildScreeningChecks(app);
          const reject = data.decision === "Reject to Applicant" || data.decision === "KU(IKL) Reject to Applicant";
          const technicalAmendment = data.decision === "Technical Amendment Required";
          const sendTechnical = data.decision === "KU(IKL) Confirm - Send to Technical Units";
          return {
            status: reject ? "incomplete" : technicalAmendment ? "technical_amendment" : sendTechnical ? "technical_review" : "ku_ikl_review",
            current_step: Math.max(Number(app.current_step || 1), 5),
            form_data: mergeFormData(app, {
              auto_screening: {
                status: "Screened",
                result: reject ? "Rejected to Applicant" : data.decision,
                remarks: data.comment,
                checks,
                checked_at: new Date().toISOString(),
              },
              correction_request: reject
                ? {
                    source: data.decision.includes("KU") ? "KU(IKL)" : "PT(IKL)",
                    remarks: data.comment,
                    requested_at: new Date().toISOString(),
                  }
                : app.form_data?.correction_request || null,
            }),
          };
        },
      },
      {
        label: "Submit Site Visit",
        labelKey: "workspace.action.submitSiteVisit",
        icon: "add_photo_alternate",
        requiresComment: false,
        success: "Site visit saved.",
        successKey: "workspace.message.siteVisitSaved",
        buildPayload: (app, data) => ({
          status: "technical_site_visit",
          current_step: Math.max(Number(app.current_step || 1), 5),
          form_data: mergeFormData(app, {
            technical_site_visit: {
              ...(app.form_data?.technical_site_visit || {}),
              site_photo: data.technicalSite.site_photo,
              license_fee_calculation: data.technicalSite.license_fee_calculation,
              deposit_calculation: data.technicalSite.deposit_calculation,
              site_remarks: data.technicalSite.site_remarks,
              officer_role: "PT/PO/KP Unit Iklan",
              visited_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
    details: ScreeningDetails,
  },
  technical: {
    eyebrow: "Parallel Review",
    eyebrowKey: "workspace.technical.eyebrow",
    title: "Technical Review",
    titleKey: "workspace.technical.title",
    description: "Record site visit photos, license fee/deposit calculations, support decision, and technical remarks.",
    descriptionKey: "workspace.technical.description",
    queueTitle: "Technical Queue",
    queueTitleKey: "workspace.technical.queue",
    actionDescription: "Enter technical decision and site finding remarks.",
    actionDescriptionKey: "workspace.technical.action",
    showDecision: true,
    showComment: true,
    showTechnicalSiteVisit: true,
    defaultDecision: "Supported",
    decisions: [
      { value: "Supported", labelKey: "workspace.decision.supported" },
      { value: "Supported with Conditions", labelKey: "workspace.decision.supportedConditions" },
      { value: "Not Supported", labelKey: "workspace.decision.notSupported" },
      { value: "Requires Amendment", labelKey: "workspace.decision.requiresAmendment" },
    ],
    commentLabel: "Technical Comment",
    commentLabelKey: "workspace.comment.technical",
    commentPlaceholder: "Add department comments, conditions, site notes, or rejection reasons.",
    commentPlaceholderKey: "workspace.comment.technicalPlaceholder",
    stats: (apps) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !app.form_data?.technical_review), icon: "pending", tone: "amber" },
      { label: "Completed", labelKey: "workspace.stat.completed", value: countBy(apps, (app) => Boolean(app.form_data?.technical_review)), icon: "task_alt" },
      { label: "Supported", labelKey: "workspace.stat.supported", value: countBy(apps, (app) => app.form_data?.technical_review?.decision === "Supported"), icon: "thumb_up" },
      { label: "Not Supported", labelKey: "workspace.stat.notSupported", value: countBy(apps, (app) => app.form_data?.technical_review?.decision === "Not Supported"), icon: "thumb_down", tone: "red" },
    ],
    actions: [
      {
        label: "Submit Review",
        labelKey: "workspace.action.submitReview",
        icon: "send",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: (app, data) => ({
              status: "technical_review_completed",
              current_step: Math.max(Number(app.current_step || 1), 5),
              form_data: mergeFormData(app, {
                technical_review: {
                  status: "Completed",
                  decision: data.decision,
                  comment: data.comment,
                  department: "Advertisement Unit",
                  reviewed_at: new Date().toISOString(),
                },
                technical_site_visit: {
                  ...(app.form_data?.technical_site_visit || {}),
                  site_photo: data.technicalSite.site_photo,
                  site_photo_note: data.comment,
                  license_fee_calculation: data.technicalSite.license_fee_calculation,
                  deposit_calculation: data.technicalSite.deposit_calculation,
                  site_remarks: data.technicalSite.site_remarks || data.comment,
                  visited_at: new Date().toISOString(),
                },
              }),
            }),
      },
    ],
  },
  approval: {
    eyebrow: "Management and MPHLG",
    eyebrowKey: "workspace.approval.eyebrow",
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
    description: "Generate invoices, record Bank Islam online/counter cash payment, and verify uploaded proof.",
    descriptionKey: "workspace.payment.description",
    queueTitle: "Payment Queue",
    queueTitleKey: "workspace.payment.queue",
    actionDescription: "Generate or verify payment for the selected application.",
    actionDescriptionKey: "workspace.payment.action",
    showComment: true,
    commentLabel: "Payment Reference / Notes",
    commentLabelKey: "workspace.comment.payment",
    commentPlaceholder: "Receipt reference, transfer notes, or verification remarks.",
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
        label: "Submit Payment",
        labelKey: "workspace.action.submitPayment",
        icon: "payments",
        success: "Payment submission recorded.",
        successKey: "workspace.message.paymentRecorded",
        buildPayload: (app, data) => ({
          status: "payment_submitted",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              invoice_no: getInvoiceNo(app),
              amount: app.form_data?.payment?.amount || 250,
              status: "Payment Submitted",
              method: data.comment?.toLowerCase().includes("cash")
                ? "Counter Cash"
                : "Bank Islam Online Banking",
              receipt_reference: data.comment || "Manual submission",
              submitted_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Verify Payment",
        labelKey: "workspace.action.verifyPayment",
        icon: "verified",
        success: "Payment verified.",
        successKey: "workspace.message.paymentVerified",
        buildPayload: (app) => ({
          status: "payment_verified",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Payment Verified",
              verified_at: new Date().toISOString(),
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

function ScreeningDetails({ app, t }) {
  const checks = buildScreeningChecks(app);

  return (
    <div className="space-y-2">
      {checks.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
          <span className="text-sm font-medium text-slate-700">{t(item.labelKey, item.label)}</span>
          <StatusPill value={t(item.resultKey, item.result)} />
        </div>
      ))}
    </div>
  );
}

function TechnicalSiteVisitFields({ t, value, onChange, onFileChange }) {
  function updateField(field, nextValue) {
    onChange((prev) => ({ ...prev, [field]: nextValue }));
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">
          {t("workspace.technical.siteVisitTitle")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {t("workspace.technical.siteVisitDesc")}
        </p>
      </div>

      <Field label={t("workspace.technical.sitePhoto")}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
            <span className="material-symbols-outlined mr-1 text-base">
              add_photo_alternate
            </span>
            {t("workspace.technical.uploadSitePhoto")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => onFileChange(event.target.files?.[0])}
            />
          </label>
          {value.site_photo?.name && (
            <span className="text-xs font-medium text-emerald-700">
              {t("workspace.technical.sitePhotoUploaded")}: {value.site_photo.name}
            </span>
          )}
        </div>
      </Field>

      {value.site_photo?.dataUrl && (
        <img
          src={value.site_photo.dataUrl}
          alt={t("workspace.technical.sitePhoto")}
          className="max-h-44 w-full rounded-md border border-slate-200 object-cover"
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t("workspace.technical.licenseFee")}>
          <input
            value={value.license_fee_calculation}
            onChange={(event) => updateField("license_fee_calculation", event.target.value)}
            className="form-input"
            inputMode="decimal"
          />
        </Field>
        <Field label={t("workspace.technical.deposit")}>
          <input
            value={value.deposit_calculation}
            onChange={(event) => updateField("deposit_calculation", event.target.value)}
            className="form-input"
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

function PaymentDetails({ app, t }) {
  const payment = app.form_data?.payment || {};
  return (
    <div className="grid grid-cols-1 gap-3 text-sm">
      <Info label={t("common.invoice")} value={payment.invoice_no || getInvoiceNo(app)} />
      <Info label={t("common.amount")} value={formatCurrency(payment.amount || 250)} />
      <Info label={t("common.status")} value={payment.status || t("workspace.info.notGenerated")} />
      <Info label={t("workspace.info.receipt")} value={payment.receipt_reference || t("workspace.info.notSubmitted")} />
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

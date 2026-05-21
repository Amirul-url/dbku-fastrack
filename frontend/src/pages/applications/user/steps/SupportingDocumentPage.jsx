import { useEffect, useState } from "react";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../../context/LanguageContext";
import {
  apiRequest,
  fetchAuthenticatedBlob,
  uploadApplicationDocument,
} from "../../../../services/api";
import {
  canEditApplicationForm,
  formatWorkflowStatus,
  getApplicantDisplayStatus,
} from "../../../../utils/workflow";
import {
  applicationStatusLabel,
  applicationTypeLabel,
  documentDescription,
  documentTitle,
  readOnlyMessage,
  stepText,
} from "./ApplicationStepText";
import AdminViewStepControls from "./AdminViewStepControls";
import UserViewStepControls from "./UserViewStepControls";

const TITLE_DOCUMENT_NAME = "Extract of Document of Titles of the Land";
const OTHER_DOCUMENT_NAME = "Other Relevant Supporting Documents (If Any)";

const requiredDocumentTemplates = [
  {
    title: "Site Plan",
    description:
      "To be drawn on Cadastral Plan showing the subject land and the surrounding land (preferred scale 1:1000) involving:-\nSite; or\nbuilding plan.\nIf none of above, drawing on Google Map is accepted.",
    format: "DXF/ PDF/ IMAGE",
    required: true,
    attachment: null,
  },
  {
    title: "Cadastral Plan",
    description:
      "Cadastral plan (preferred scale 1:1000) showing the subject land and the surrounding land.\nDigital copy is available from eLASIS website.",
    format: "PDF/ IMAGE",
    required: true,
    attachment: null,
  },
  {
    title: "Site Photographs",
    description: "-",
    format: "PDF/ IMAGE",
    required: true,
    attachment: null,
  },
  {
    title: "Tenancy Agreement",
    description: "-",
    format: "PDF",
    required: true,
    attachment: null,
  },
];

function getDefaultDocuments(step1 = {}, titleAttachment = null) {
  return [
    ...requiredDocumentTemplates,
    {
      title: TITLE_DOCUMENT_NAME,
      description: getLandInformationFromStep1(step1),
      format: "PDF",
      required: false,
      attachment: titleAttachment,
    },
  ];
}

function normalizeDocuments(savedDocuments, defaults) {
  if (!Array.isArray(savedDocuments) || savedDocuments.length === 0) {
    return defaults;
  }

  return defaults.map((defaultItem, index) => {
    const savedByTitle = savedDocuments.find(
      (item) => item?.title === defaultItem.title
    );
    const savedItem = savedByTitle || savedDocuments[index] || {};

    return {
      ...defaultItem,
      description: savedItem.description || defaultItem.description,
      attachment: savedItem.attachment || defaultItem.attachment || null,
    };
  });
}

function getSavedAttachmentByTitle(savedDocuments, title) {
  return savedDocuments.find((item) => item?.title === title)?.attachment || null;
}

function getLandInformationFromStep1(step1) {
  return (
    step1.land_information ||
    step1.land_info ||
    step1.affected_land ||
    step1.affectedLand ||
    step1.locality_address ||
    step1.site_address ||
    step1.address ||
    ""
  );
}

function SupportingDocumentPage({
  LayoutComponent = UserDashboardLayout,
  StepNavComponent = null,
  mode = "user",
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tx = (key) => stepText(language, key);
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const Layout = LayoutComponent;
  const StepNav = StepNavComponent;
  const isAdminView = mode === "admin-view";
  const isAdminReview = mode === "admin" || isAdminView;
  const adminStepPath = (step) =>
    `/admin/applications/${applicationId}${isAdminView ? "/view" : ""}/step-${step}?id=${applicationId}`;

  const [step1, setStep1] = useState({});
  const [documents, setDocuments] = useState(() => getDefaultDocuments());
  const [otherDocuments, setOtherDocuments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [applicationRecord, setApplicationRecord] = useState(null);

  useEffect(() => {
    if (applicationId) {
      // eslint-disable-next-line react-hooks/immutability
      loadApplication();
    }
  }, [applicationId]);

  async function loadApplication() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const formData = data.form_data || {};
      const step1Data = formData.step_1 || {};
      const step10 = formData.step_10 || {};
      const savedDocuments = Array.isArray(step10.documents)
        ? [...step10.documents]
        : [];
      const savedTitleDocuments = Array.isArray(step10.title_documents)
        ? step10.title_documents
        : [];
      const savedOtherDocuments = Array.isArray(step10.other_documents)
        ? step10.other_documents
        : [];
      const titleAttachment =
        savedTitleDocuments[0]?.attachment ||
        getSavedAttachmentByTitle(savedDocuments, TITLE_DOCUMENT_NAME);
      const otherAttachment =
        savedOtherDocuments[0]?.attachment ||
        getSavedAttachmentByTitle(savedDocuments, OTHER_DOCUMENT_NAME);
      const generatedOtherDocuments = otherAttachment
        ? [
            {
              description: OTHER_DOCUMENT_NAME,
              format: "PDF/ IMAGE",
              attachment: otherAttachment,
            },
          ]
        : [];
      const defaultDocuments = getDefaultDocuments(step1Data, titleAttachment);

      setApplicationRecord(data);
      setStep1(step1Data);
      setDocuments(normalizeDocuments(savedDocuments, defaultDocuments));
      setOtherDocuments(
        savedOtherDocuments.length > 0 ? savedOtherDocuments : generatedOtherDocuments
      );
    } catch (err) {
      console.error("Load supporting document failed:", err);
    }
  }

  async function saveStep10({ goNext = false } = {}) {
    if (isReadOnly) return false;

    if (!applicationId) {
      alert(tx("missingApplication"));
      return false;
    }

    const missingDocuments = goNext
      ? documents.filter((document) => document.required && !document.attachment)
      : [];

    if (missingDocuments.length > 0) {
      alert(
        `${tx("missingDocumentsPrefix")}\n\n${missingDocuments
          .map((document) => `- ${documentTitle(language, document.title)}`)
          .join("\n")}`
      );
      return false;
    }

    try {
      setSaving(true);

      const updatedStep10 = {
        title: "Supporting Document",
        status: "Saved",
        documents,
        title_documents: [],
        other_documents: otherDocuments,
        saved_at: new Date().toISOString(),
      };

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: goNext ? 4 : 3,
          form_data: {
            step_10: updatedStep10,
          },
        }),
      });

      if (goNext) {
        navigate(
          isAdminReview
            ? adminStepPath(4)
            : `/applications/${applicationId}/declaration?id=${applicationId}`
        );
      }

      return true;
    } catch (err) {
      console.error("Supporting Document save failed:", err);
      alert(tx("failedSaveSupporting"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDocumentFileChange(index, file) {
    if (isReadOnly) return;
    if (!file) return;

    try {
      const attachment = await uploadApplicationDocument(
        applicationId,
        documents[index]?.title || file.name,
        file
      );

      setDocuments((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { ...item, attachment } : item
        )
      );
    } catch (err) {
      console.error("Document upload failed:", err);
      alert(tx("failedUpload"));
    }
  }

  async function handleOtherFileChange(index, file) {
    if (isReadOnly) return;
    if (!file) return;

    try {
      const attachment = await uploadApplicationDocument(
        applicationId,
        otherDocuments[index]?.description || OTHER_DOCUMENT_NAME,
        file
      );

      setOtherDocuments((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { ...item, attachment } : item
        )
      );
    } catch (err) {
      console.error("Other document upload failed:", err);
      alert(tx("failedUpload"));
    }
  }

  function removeDocumentFile(index) {
    if (isReadOnly) return;

    setDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, attachment: null } : item
      )
    );
  }

  function removeOtherFile(index) {
    if (isReadOnly) return;

    setOtherDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, attachment: null } : item
      )
    );
  }

  function addOtherDocument() {
    if (isReadOnly) return;

    setOtherDocuments((prev) => [
      ...prev,
      {
        description: "",
        format: "PDF/ IMAGE",
        attachment: null,
      },
    ]);
  }

  function updateOtherDocument(index, field, value) {
    if (isReadOnly) return;

    setOtherDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function removeOtherDocument(index) {
    if (isReadOnly) return;

    setOtherDocuments((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function handleSaveAndNext() {
    await saveStep10({ goNext: true });
  }

  async function handleSaveDraftAndBack() {
    const saved = await saveStep10({ goNext: false });
    if (saved) {
      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard?tab=applications");
    }
  }

  const isReadOnly =
    isAdminView ||
    (!isAdminReview &&
      Boolean(applicationId) &&
      (!applicationRecord || !canEditApplicationForm(applicationRecord)));

  return (
    <Layout>
      <div className="flex gap-4">
        {StepNav && <StepNav active={3} />}

        <main className="flex-1 min-w-0 pb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                3
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                {tx("supportingDocument")}
              </h1>
            </div>

            {isAdminView ? (
              <AdminViewStepControls
                applicationId={applicationId}
                currentStep={3}
                language={language}
              />
            ) : isReadOnly ? (
              <UserViewStepControls
                applicationId={applicationId}
                currentStep={3}
                language={language}
              />
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  disabled={saving}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  {saving ? tx("saving") : tx("saveDraftBackApplications")}
                </button>

                <Link
                  to={
                    isAdminReview
                      ? adminStepPath(2)
                      : `/applications/${applicationId}/submitting-person?id=${applicationId}`
                  }
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx("previous")}
                </Link>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSaveAndNext}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
                  >
                    {saving ? tx("saving") : tx("saveNext")}
                  </button>
                )}
              </div>
            )}
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference step1={step1} language={language} />

            {isReadOnly && (
              <ReadOnlyNotice language={language} status={applicationRecord?.status} />
            )}

            <div className="space-y-7 p-4 lg:p-5">
              <SupportingTable
                rows={documents}
                readOnly={isReadOnly}
                language={language}
                onFileChange={handleDocumentFileChange}
                onRemoveFile={removeDocumentFile}
              />

              <OtherSupportingTable
                rows={otherDocuments}
                readOnly={isReadOnly}
                language={language}
                onAdd={addOtherDocument}
                onUpdate={updateOtherDocument}
                onRemove={removeOtherDocument}
                onFileChange={handleOtherFileChange}
                onRemoveFile={removeOtherFile}
              />

              {isAdminView ? (
                <AdminViewStepControls
                  applicationId={applicationId}
                  currentStep={3}
                  language={language}
                  className="border-t border-slate-200 pt-4"
                />
              ) : isReadOnly ? (
                <UserViewStepControls
                  applicationId={applicationId}
                  currentStep={3}
                  language={language}
                  className="border-t border-slate-200 pt-4"
                />
              ) : (
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={handleSaveDraftAndBack}
                    disabled={saving}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                  >
                    {saving ? tx("saving") : tx("saveDraftBackApplications")}
                  </button>

                  <Link
                    to={
                      isAdminReview
                        ? adminStepPath(2)
                        : `/applications/${applicationId}/submitting-person?id=${applicationId}`
                    }
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                  >
                    {tx("previous")}
                  </Link>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleSaveAndNext}
                      disabled={saving}
                      className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
                    >
                      {saving ? tx("saving") : tx("saveNext")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference({ step1, language }) {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const tx = (key) => stepText(language, key);

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>{tx("digitalReference")}</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>{tx("agencyReference")}</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>
          </>
        )}

        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationStatusLabel(language, step1.status)}
        </p>

        <p>{tx("applicationType")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationTypeLabel(language, step1.application_type_label || "Application of Siting Project")}
        </p>
      </div>
    </div>
  );
}

function ReadOnlyNotice({ language, status }) {
  const displayStatus = getApplicantDisplayStatus(status);

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      {readOnlyMessage(language, applicationStatusLabel(language, formatWorkflowStatus(displayStatus)))}
    </div>
  );
}

function SupportingTable({ rows, readOnly = false, language = "en", onFileChange, onRemoveFile }) {
  const tx = (key) => stepText(language, key);

  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-slate-700">
          {tx("requiredSupportingDocuments")}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[11px]">
          <thead className="bg-[#f1f5f4] text-slate-700">
            <tr>
              <TableHead className="w-[44px] text-center">#</TableHead>
              <TableHead className="w-[210px]">{tx("title")}</TableHead>
              <TableHead>{tx("description")}</TableHead>
              <TableHead className="w-[120px]">{tx("format")}</TableHead>
              <TableHead className="w-[280px]">{tx("attachment")}</TableHead>
              <TableHead className="w-[120px] text-center">{tx("action")}</TableHead>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.title}-${index}`}
                className={index % 2 === 0 ? "bg-[#e4f4df]" : "bg-white"}
              >
                <TableCell center>
                  <span className="text-base font-bold text-[#18b36b]">
                    {index + 1}
                  </span>
                </TableCell>

                <TableCell>
                  <span className="font-semibold text-slate-800">
                    {documentTitle(language, row.title)}
                  </span>
                </TableCell>

                <TableCell>
                  <p className="whitespace-pre-line leading-relaxed text-slate-700">
                    {row.title === TITLE_DOCUMENT_NAME
                      ? row.description || tx("noLandInfo")
                      : documentDescription(language, row.title, row.description)}
                  </p>
                </TableCell>

                <TableCell>
                  <span className="font-semibold text-slate-700">
                    {row.format}
                  </span>
                </TableCell>

                <TableCell>
                  <AttachmentView attachment={row.attachment} language={language} />
                </TableCell>

                <TableCell center>
                    <FileAction
                      index={index}
                      attachment={row.attachment}
                      required={row.required}
                      readOnly={readOnly}
                      language={language}
                      onFileChange={onFileChange}
                      onRemoveFile={onRemoveFile}
                    />
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OtherSupportingTable({
  rows,
  readOnly = false,
  language = "en",
  onAdd,
  onUpdate,
  onRemove,
  onFileChange,
  onRemoveFile,
}) {
  const tx = (key) => stepText(language, key);

  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-slate-700">
          {tx("otherSupportingDocuments")}
        </h2>

        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded bg-[#18b36b] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#128a53]"
          >
            {tx("addDocument")}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[11px]">
          <thead className="bg-[#f1f5f4] text-slate-700">
            <tr>
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead>{tx("description")}</TableHead>
              <TableHead className="w-[110px]">{tx("format")}</TableHead>
              <TableHead className="w-[280px]">{tx("attachment")}</TableHead>
              <TableHead className="w-[150px] text-center">{tx("action")}</TableHead>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr className="bg-[#e4f4df]">
                <TableCell colSpan={5} center>
                  {tx("noRecord")}
                </TableCell>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`other-${index}`}
                  className={index % 2 === 0 ? "bg-[#e4f4df]" : "bg-white"}
                >
                  <TableCell>{index + 1}</TableCell>

                  <TableCell>
                    <input
                      type="text"
                      value={row.description || ""}
                      onChange={(event) =>
                        onUpdate(index, "description", event.target.value)
                      }
                      readOnly={readOnly}
                      placeholder={tx("documentDescriptionPlaceholder")}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#18b36b] focus:ring-1 focus:ring-[#18b36b]"
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      type="text"
                      value={row.format || ""}
                      onChange={(event) =>
                        onUpdate(index, "format", event.target.value)
                      }
                      readOnly={readOnly}
                      placeholder="PDF/IMAGE"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#18b36b] focus:ring-1 focus:ring-[#18b36b]"
                    />
                  </TableCell>

                  <TableCell>
                    <AttachmentView attachment={row.attachment} language={language} />
                  </TableCell>

                  <TableCell center>
                    <div className="flex items-center justify-center gap-2">
                      <FileAction
                        index={index}
                        attachment={row.attachment}
                        required={false}
                        readOnly={readOnly}
                        language={language}
                        onFileChange={onFileChange}
                        onRemoveFile={onRemoveFile}
                      />

                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onRemove(index)}
                          className="inline-flex h-8 px-2 items-center justify-center gap-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-[10px] font-semibold"
                          title="Remove row"
                        >
                          {tx("deleteRow")}
                        </button>
                      )}
                    </div>
                  </TableCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttachmentView({ attachment, language = "en" }) {
  const tx = (key) => stepText(language, key);

  if (!attachment) {
    return <span className="text-slate-500">{tx("noAttachment")}</span>;
  }

  return (
    <div className="space-y-1">
      <p className="break-all font-semibold text-[#00843d]">{attachment.name}</p>
      <p className="text-[10px] text-slate-500">
        {(Number(attachment.size || 0) / 1024).toFixed(1)} KB
      </p>
    </div>
  );
}

function FileAction({
  index,
  attachment,
  required,
  readOnly = false,
  language = "en",
  onFileChange,
  onRemoveFile,
}) {
  const attachmentUrl = attachment?.url || attachment?.file_url || attachment?.dataUrl;
  const tx = (key) => stepText(language, key);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!attachmentUrl || downloading) return;

    try {
      setDownloading(true);

      const blob =
        attachmentUrl.startsWith("blob:") || attachmentUrl.startsWith("data:")
          ? await fetch(attachmentUrl).then((response) => response.blob())
          : await fetchAuthenticatedBlob(attachmentUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = attachment?.name || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      console.error("Failed to download attachment:", error);
      alert(tx("failedDownload"));
    } finally {
      setDownloading(false);
    }
  }

  if (readOnly) {
    return (
      <div className="flex items-center justify-center gap-2">
        <span className="w-3 text-center text-sm font-bold text-red-500">
          {required ? "*" : ""}
        </span>

        {attachment ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={!attachmentUrl || downloading}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-white text-emerald-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            title={tx("download")}
            aria-label={tx("download")}
          >
            <span
              className="material-symbols-outlined leading-none"
              style={{ fontSize: "17px" }}
            >
              file_download
            </span>
          </button>
        ) : (
          <span className="h-8 w-8" />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <div className="grid grid-cols-[10px_32px_32px_32px] items-center gap-2">
        <span className="text-center text-sm font-bold text-red-500">
          {required ? "*" : ""}
        </span>

        <label
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-[#18b36b] text-white shadow-sm hover:bg-[#128a53]"
          title={tx("upload")}
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            upload
          </span>

          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.dxf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              onFileChange(index, file);
              event.target.value = "";
            }}
          />
        </label>

        {attachment ? (
          <>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!attachmentUrl || downloading}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-white text-emerald-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={tx("download")}
              aria-label={tx("download")}
            >
              <span
                className="material-symbols-outlined leading-none"
                style={{ fontSize: "18px" }}
              >
                file_download
              </span>
            </button>

            <button
              type="button"
              onClick={() => onRemoveFile(index)}
              className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
              title={tx("removeFile")}
            >
              X
            </button>
          </>
        ) : (
          <>
            <span className="h-8 w-8" />
            <span className="h-8 w-8" />
          </>
        )}
      </div>
    </div>
  );
}

function TableHead({ children, className = "" }) {
  return (
    <th
      className={`border border-slate-200 px-3 py-2 text-left font-bold ${className}`}
    >
      {children}
    </th>
  );
}

function TableCell({ children, center = false, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-slate-200 px-3 py-2 align-top ${
        center ? "text-center align-middle" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}

export default SupportingDocumentPage;

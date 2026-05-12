import { useEffect, useState } from "react";
import AdminDashboardLayout from "../../../../layout/AdminDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  apiRequest,
  uploadApplicationDocument,
} from "../../../../services/api";
import AdminApplicationStepNav from "../AdminApplicationStepNav";

const defaultDocuments = [
  {
    title: "Site Plan",
    description:
      "To be drawn on Cadastral Plan showing the subject land and the surrounding land (preferred scale 1:1000) involving:-\nSite; or\nbuilding plan.\nIf none of above, drawing on Google Map is accepted.",
    format: "DXF/ PDF/ IMAGE",
    required: true,
    guideline: true,
    attachment: null,
  },
  {
    title: "Cadastral Plan",
    description:
      "Cadastral plan (preferred scale 1:1000) showing the subject land and the surrounding land.\nDigital copy is available from eLASIS website.",
    format: "PDF/ IMAGE",
    required: true,
    guideline: false,
    attachment: null,
  },
  {
    title: "Site Photographs",
    description: "-",
    format: "PDF/ IMAGE",
    required: true,
    guideline: false,
    attachment: null,
  },
  {
    title: "Tenancy Agreement",
    description: "-",
    format: "PDF",
    required: true,
    guideline: false,
    attachment: null,
  },
];

const DUMMY_LAND_VALUE = "Lot 3786 Block 207 Kuching North Land District";

function normalizeDocuments(savedDocuments, defaults) {
  if (!Array.isArray(savedDocuments) || savedDocuments.length === 0) {
    return defaults;
  }

  return defaults.map((defaultItem, index) => ({
    ...defaultItem,
    ...(savedDocuments[index] || {}),
    attachment: savedDocuments[index]?.attachment || null,
  }));
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

function buildTitleDocumentsFromStep1(step1) {
  const landInfo = getLandInformationFromStep1(step1);

  if (!landInfo) return [];

  return [
    {
      land: landInfo,
      format: "PDF",
      attachment: null,
    },
  ];
}

function AdminStep10Page() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const Layout = AdminDashboardLayout;

  const [step1, setStep1] = useState({});
  const [documents, setDocuments] = useState(defaultDocuments);
  const [titleDocuments, setTitleDocuments] = useState([]);
  const [otherDocuments, setOtherDocuments] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (applicationId) {
      loadApplication();
    }
  }, [applicationId]);

  async function loadApplication() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const formData = data.form_data || {};
      const step1Data = formData.step_1 || {};
      const step10 = formData.step_10 || {};

      const savedTitleDocuments = Array.isArray(step10.title_documents)
        ? step10.title_documents
        : [];

      const hasOldDummy =
        savedTitleDocuments?.[0]?.land === DUMMY_LAND_VALUE;

      const generatedTitleDocuments = buildTitleDocumentsFromStep1(step1Data);

      setStep1(step1Data);
      setDocuments(normalizeDocuments(step10.documents, defaultDocuments));
      setTitleDocuments(
        savedTitleDocuments.length > 0 && !hasOldDummy
          ? savedTitleDocuments
          : generatedTitleDocuments
      );
      setOtherDocuments(step10.other_documents || []);
    } catch (err) {
      console.error("Load supporting document failed:", err);
    }
  }

  async function saveStep10({ goNext = false } = {}) {
    if (!applicationId) {
      alert("Application ID is missing. Please continue from My Dashboard.");
      return false;
    }

    try {
      setSaving(true);

      const updatedStep10 = {
        title: "Supporting Document",
        status: "Saved",
        documents,
        title_documents: titleDocuments,
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
        navigate(`/admin/applications/${applicationId}/step-4?id=${applicationId}`);
      }

      return true;
    } catch (err) {
      console.error("Supporting Document save failed:", err);
      alert("Failed to save Supporting Document.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDocumentFileChange(index, file) {
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
      alert("Failed to upload file.");
    }
  }

  async function handleTitleFileChange(index, file) {
    if (!file) return;

    try {
      const attachment = await uploadApplicationDocument(
        applicationId,
        titleDocuments[index]?.land || "Extract of Document of Titles of the Land",
        file
      );

      setTitleDocuments((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { ...item, attachment } : item
        )
      );
    } catch (err) {
      console.error("Title document upload failed:", err);
      alert("Failed to upload file.");
    }
  }

  async function handleOtherFileChange(index, file) {
    if (!file) return;

    try {
      const attachment = await uploadApplicationDocument(
        applicationId,
        otherDocuments[index]?.description || "Other Relevant Supporting Documents",
        file
      );

      setOtherDocuments((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { ...item, attachment } : item
        )
      );
    } catch (err) {
      console.error("Other document upload failed:", err);
      alert("Failed to upload file.");
    }
  }

  function removeDocumentFile(index) {
    setDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, attachment: null } : item
      )
    );
  }

  function removeTitleFile(index) {
    setTitleDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, attachment: null } : item
      )
    );
  }

  function removeOtherFile(index) {
    setOtherDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, attachment: null } : item
      )
    );
  }

  function addOtherDocument() {
    setOtherDocuments((prev) => [
      ...prev,
      {
        description: "",
        format: "PDF/IMAGE",
        attachment: null,
      },
    ]);
  }

  function updateOtherDocument(index, field, value) {
    setOtherDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function removeOtherDocument(index) {
    setOtherDocuments((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function handleSaveAndNext() {
    await saveStep10({ goNext: true });
  }

  return (
    <Layout>
      <div className="flex gap-4">
        <AdminApplicationStepNav active={3} />

        <main className="flex-1 min-w-0 pb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                3
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                Supporting Document
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to={`/admin/applications/${applicationId}/step-2?id=${applicationId}`}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <button
                type="button"
                onClick={() => saveStep10({ goNext: true })}
                disabled={saving}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save & Next"}
              </button>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference step1={step1} />

            <div className="space-y-7 p-4 lg:p-5">
              <SupportingTable
                rows={documents}
                onFileChange={handleDocumentFileChange}
                onRemoveFile={removeDocumentFile}
              />

              <TitleTable
                rows={titleDocuments}
                onFileChange={handleTitleFileChange}
                onRemoveFile={removeTitleFile}
              />

              <OtherSupportingTable
                rows={otherDocuments}
                onAdd={addOtherDocument}
                onUpdate={updateOtherDocument}
                onRemove={removeOtherDocument}
                onFileChange={handleOtherFileChange}
                onRemoveFile={removeOtherFile}
              />

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Link
                to={`/admin/applications/${applicationId}/step-2?id=${applicationId}`}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={saving}
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save & Next"}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference({ step1 }) {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>Digital Reference</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>Agency Reference</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>
          </>
        )}

        <p>Status</p>
        <p className="font-semibold text-[#006d32]">
          {step1.status || "Prepare Case"}
        </p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          {step1.application_type_label || "Application of Siting Project"}
        </p>
      </div>
    </div>
  );
}

function SupportingTable({ rows, onFileChange, onRemoveFile }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-slate-700">
          Required Supporting Documents
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[11px]">
          <thead className="bg-[#f1f5f4] text-slate-700">
            <tr>
              <TableHead className="w-[44px] text-center">#</TableHead>
              <TableHead className="w-[210px]">Title</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px]">Format</TableHead>
              <TableHead className="w-[280px]">Attachment</TableHead>
              <TableHead className="w-[120px] text-center">Action</TableHead>
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
                    {row.title}
                  </span>
                </TableCell>

                <TableCell>
                  <p className="whitespace-pre-line leading-relaxed text-slate-700">
                    {row.description}
                  </p>

                  {row.guideline && (
                    <button
                      type="button"
                      className="mt-2 rounded bg-[#18b36b] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#128a53]"
                    >
                      Guidelines
                    </button>
                  )}
                </TableCell>

                <TableCell>
                  <span className="font-semibold text-slate-700">
                    {row.format}
                  </span>
                </TableCell>

                <TableCell>
                  <AttachmentView attachment={row.attachment} />
                </TableCell>

                <TableCell center>
                  <FileAction
                    index={index}
                    attachment={row.attachment}
                    required={row.required}
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

function TitleTable({ rows, onFileChange, onRemoveFile }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-slate-700">
          Extract of Document of Titles of the Land
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[11px]">
          <thead className="bg-[#f1f5f4] text-slate-700">
            <tr>
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead>Land Information</TableHead>
              <TableHead className="w-[100px]">Format</TableHead>
              <TableHead className="w-[280px]">Attachment</TableHead>
              <TableHead className="w-[120px] text-center">Action</TableHead>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr className="bg-[#e4f4df]">
                <TableCell colSpan={5} center>
                  No land information found from Step 1.
                </TableCell>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.land}-${index}`} className="bg-[#e4f4df]">
                  <TableCell>{index + 1}</TableCell>

                  <TableCell>
                    <span className="font-semibold text-slate-800">
                      {row.land}
                    </span>
                  </TableCell>

                  <TableCell>{row.format}</TableCell>

                  <TableCell>
                    <AttachmentView attachment={row.attachment} />
                  </TableCell>

                  <TableCell center>
                    <FileAction
                      index={index}
                      attachment={row.attachment}
                      required={false}
                      onFileChange={onFileChange}
                      onRemoveFile={onRemoveFile}
                    />
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

function OtherSupportingTable({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  onFileChange,
  onRemoveFile,
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-slate-700">
          Other Relevant Supporting Documents (If Any)
        </h2>

        <button
          type="button"
          onClick={onAdd}
          className="rounded bg-[#18b36b] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#128a53]"
        >
          + Add Document
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[11px]">
          <thead className="bg-[#f1f5f4] text-slate-700">
            <tr>
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[110px]">Format</TableHead>
              <TableHead className="w-[280px]">Attachment</TableHead>
              <TableHead className="w-[150px] text-center">Action</TableHead>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr className="bg-[#e4f4df]">
                <TableCell colSpan={5} center>
                  --No record--
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
                      placeholder="Enter document description"
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
                      placeholder="PDF/IMAGE"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#18b36b] focus:ring-1 focus:ring-[#18b36b]"
                    />
                  </TableCell>

                  <TableCell>
                    <AttachmentView attachment={row.attachment} />
                  </TableCell>

                  <TableCell center>
                    <div className="flex items-center justify-center gap-2">
                      <FileAction
                        index={index}
                        attachment={row.attachment}
                        required={false}
                        onFileChange={onFileChange}
                        onRemoveFile={onRemoveFile}
                      />

                      <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="inline-flex h-8 px-2 items-center justify-center gap-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-[10px] font-semibold"
                        title="Remove row"
                      >
                        Delete Row
                      </button>
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

function AttachmentView({ attachment }) {
  if (!attachment) {
    return <span className="text-slate-500">No attachment found.</span>;
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
  onFileChange,
  onRemoveFile,
}) {
  const attachmentUrl = attachment?.url || attachment?.file_url || attachment?.dataUrl;

  return (
    <div className="flex items-center justify-center">
      <div className="grid grid-cols-[10px_32px_32px_32px] items-center gap-2">
        <span className="text-center text-sm font-bold text-red-500">
          {required ? "*" : ""}
        </span>

        <label
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-[#18b36b] text-white shadow-sm hover:bg-[#128a53]"
          title="Upload"
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
            <a
              href={attachmentUrl}
              download={attachment.name}
              className="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-700 text-white shadow-sm hover:bg-slate-900"
              title="Download"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">
                download
              </span>
            </a>

            <button
              type="button"
              onClick={() => onRemoveFile(index)}
              className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600"
              title="Remove file"
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

export default AdminStep10Page;

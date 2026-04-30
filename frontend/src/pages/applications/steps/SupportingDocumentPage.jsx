import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

const documents = [
  {
    title: "Siting Form",
    description: "To upload the form signed by applicant",
    format: "PDF",
    attachment: "SITING FORM - BORNEO FRESH PORK.pdf",
    required: true,
  },
  {
    title: "Application Letter",
    description: "-",
    format: "PDF/IMAGE",
    attachment: "APPLICATION LETTER - BORNEO FRESH PORK.pdf",
    required: true,
  },
  {
    title: "Site Acceptance Form",
    description: "To upload the form signed by applicant",
    format: "PDF",
    attachment: "SITE ACCEPTANCE - BORNEO FRESH PORK.pdf",
  },
  {
    title: "Site Plan",
    description:
      "To be drawn on Cadastral Plan showing the subject land and the surrounding land (preferred scale 1:1000) involving:-\nSite; or\nbuilding plan.\nIf none of above, drawing on Google Map is accepted.",
    format: "DXF/ PDF/ IMAGE",
    attachment: "SITE PLAN - BORNEO FRESH PORK.pdf",
    required: true,
    guideline: true,
  },
  {
    title: "Cadastral Plan",
    description:
      "Cadastral plan (preferred scale 1:1000) showing the subject land and the surrounding land.\nDigital copy is available from eLASIS website.",
    format: "PDF/ IMAGE",
    attachment: "PELAN KADASTRAL - BORNEO FRESH PORK.pdf",
  },
  {
    title: "Project Brief",
    description: "-",
    format: "PDF",
    attachment: "No attachment found.",
  },
  {
    title: "Detailed Building Plan",
    description:
      "Submission of CAD to be in .DXF format version 2013 and 2018.",
    format: "PDF/DXF",
    attachment: "No attachment found.",
    guideline: true,
  },
  {
    title: "Conceptual Layout Plan",
    description: "-",
    format: "PDF",
    attachment: "No attachment found.",
  },
  {
    title: "Building Perspective View",
    description: "-",
    format: "PDF",
    attachment: "No attachment found.",
    guideline: true,
  },
  {
    title: "Site Inspection Plan",
    description: "-",
    format: "PDF/ IMAGE",
    attachment: "SITE INSPECTION PLAN - BORNEO FRESH PORK.pdf",
    required: true,
  },
  {
    title: "Wakaf Letter",
    description:
      "If not available, the application letter must give details on whether the premise has been rented and the period of tenancy",
    format: "PDF/IMAGE",
    attachment: "No attachment found.",
  },
  {
    title: "Site Photographs",
    description: "-",
    format: "PDF/ IMAGE",
    attachment: "SITE PHOTOGRAPH - BORNEO FRESH PORK.pdf",
    required: true,
  },
  {
    title: "Tenancy Agreement",
    description: "-",
    format: "PDF",
    attachment: "No attachment found.",
  },
  {
    title: "SBDC / SBDTC Letter",
    description: "If available, to provide SBDC / SBDTC meeting minute",
    format: "PDF/IMAGE",
    attachment: "No attachment found.",
  },
  {
    title: "SBDC / SBDTC Agreed Plan",
    description: "If available, to provide SBDC / SBDTC Agreed Plan",
    format: "PDF/IMAGE",
    attachment: "No attachment found.",
  },
  {
    title: "Letter and Plan from Sarawak Energy (SEB)",
    description: "-",
    format: "PDF/IMAGE",
    attachment: "No attachment found.",
  },
  {
    title:
      "Letter and Plan from Department of Drainage and Irrigation, Sarawak (DID)",
    description: "-",
    format: "PDF/IMAGE",
    attachment: "No attachment found.",
  },
  {
    title: "Parking Calculation",
    description:
      "This document shall be used to support and explain on your parking calculation.",
    format: "PDF",
    attachment: "No attachment found.",
  },
];

const titleDocuments = [
  {
    land: "Lot 3786 Block 207 Kuching North Land District",
    format: "PDF",
    attachment: "EOT 01-LCLS-010-207-03786.pdf",
  },
];

function SupportingDocumentPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={10} />

        <main className="flex-1 min-w-0 pb-10">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded bg-[#18b36b] px-3 text-sm font-bold text-white">
                10
              </span>

              <div>
                <h1 className="text-xl font-bold text-[#1a1c1c]">
                  Supporting Document
                </h1>
                <p className="text-xs text-slate-500">
                  Review submitted supporting documents and proceed to declaration.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Link
                to="/applications/print-form"
                className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/declaration"
                className="inline-flex items-center rounded bg-[#006d32] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#005224]"
              >
                Save & Next →
              </Link>
            </div>
          </div>

          <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-[#f7f7f7] px-5 py-4">
              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-[170px_1fr]">
                <MetaLabel>Digital Reference</MetaLabel>
                <MetaValue>ESPA.2025-1443</MetaValue>

                <MetaLabel>Agency Reference</MetaLabel>
                <MetaValue>SP/10/159/2024</MetaValue>

                <MetaLabel>Status</MetaLabel>
                <MetaValue>
                  Siting approval granted to applicant (Formal Approval)
                  <span className="ml-2 text-slate-500">◷</span>
                  <span className="ml-2 text-red-500">📍</span>
                </MetaValue>

                <MetaLabel>Application Type</MetaLabel>
                <MetaValue>Application of Siting Project</MetaValue>

                <MetaLabel>Division</MetaLabel>
                <MetaValue>KUCHING</MetaValue>
              </div>
            </div>

            <div className="space-y-7 p-4 lg:p-5">
              <SupportingTable rows={documents} />
              <TitleTable />
              <OtherSupportingTable />

              <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-5 lg:px-5">
                <div className="flex justify-end gap-2">
                  <Link
                    to="/applications/print-form"
                    className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ← Back
                  </Link>

                  <Link
                    to="/applications/declaration"
                    className="inline-flex items-center rounded bg-[#006d32] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#005224]"
                  >
                    Save & Next →
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </DashboardLayout>
  );
}

function SupportingTable({ rows }) {
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
              <TableHead className="w-[80px] text-center">Action</TableHead>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.title}
                className={index % 2 === 0 ? "bg-[#e4f4df]" : "bg-white"}
              >
                <TableCell center>
                  <span className="text-base font-bold text-[#18b36b]">↻</span>
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
                  {row.attachment === "No attachment found." ? (
                    <span className="text-slate-500">No attachment found.</span>
                  ) : (
                    <span className="font-semibold text-[#00843d]">
                      {row.attachment}
                    </span>
                  )}
                </TableCell>

                <TableCell center>
                  {row.attachment !== "No attachment found." ? (
                    <div className="mx-auto grid w-[54px] grid-cols-[32px_10px] items-center justify-center gap-1">
                      <DownloadButton />
                      {row.required ? (
                        <span className="text-sm font-bold text-red-500">*</span>
                      ) : (
                        <span />
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TitleTable() {
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
              <TableHead className="w-[80px] text-center">Action</TableHead>
            </tr>
          </thead>

          <tbody>
            {titleDocuments.map((row, index) => (
              <tr key={row.land} className="bg-[#e4f4df]">
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <span className="font-semibold text-slate-800">
                    {row.land}
                  </span>
                </TableCell>
                <TableCell>{row.format}</TableCell>
                <TableCell>
                  <span className="font-semibold text-[#00843d]">
                    {row.attachment}
                  </span>
                </TableCell>
                <TableCell center>
                  <DownloadButton />
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OtherSupportingTable() {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-slate-700">
          Other Relevant Supporting Documents (If Any)
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[11px]">
          <thead className="bg-[#f1f5f4] text-slate-700">
            <tr>
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px]">Format</TableHead>
              <TableHead className="w-[280px]">Attachment</TableHead>
            </tr>
          </thead>

          <tbody>
            <tr className="bg-[#e4f4df]">
              <TableCell colSpan={4} center>
                --No record--
              </TableCell>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetaLabel({ children }) {
  return <p className="font-medium text-slate-600">{children}</p>;
}

function MetaValue({ children }) {
  return <p className="font-bold text-[#006d32]">{children}</p>;
}

function DownloadButton() {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#18b36b] text-white shadow-sm hover:bg-[#128a53]"
      title="Download"
    >
      <span className="material-symbols-outlined text-[18px] leading-none">
        download
      </span>
    </button>
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
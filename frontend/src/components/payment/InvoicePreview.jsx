import { formatCurrency, formatDate, getApplicantName, getApplicationReference, getApplicationType, getInvoiceNo } from "../../utils/workflow";

function InvoicePreview({ application, amount, invoiceDate, dueDate }) {
  const invoiceNo = getInvoiceNo(application);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#006d32]">
            ALiS Invoice
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{invoiceNo}</h3>
        </div>

        <div className="text-right text-xs text-slate-500">
          <p>Invoice Date: {formatDate(invoiceDate)}</p>
          <p>Due Date: {formatDate(dueDate)}</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Info label="Application ID" value={getApplicationReference(application)} />
        <Info label="Applicant" value={getApplicantName(application)} />
        <Info label="Application Type" value={getApplicationType(application)} />
        <Info label="Invoice Amount" value={formatCurrency(amount)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-slate-200 text-sm">
          <thead className="bg-[#f1f5f4] text-slate-600">
            <tr>
              <th className="border-r border-slate-200 px-3 py-3 text-left text-xs font-bold uppercase">
                Description
              </th>
              <th className="px-3 py-3 text-right text-xs font-bold uppercase">
                Amount
              </th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-t border-slate-200">
              <td className="border-r border-slate-100 px-3 py-3">
                Advertisement License Processing Fee
              </td>
              <td className="px-3 py-3 text-right font-semibold">
                {formatCurrency(amount)}
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="border-r border-slate-100 px-3 py-3 text-right font-bold">
                Total
              </td>
              <td className="px-3 py-3 text-right text-base font-bold">
                {formatCurrency(amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default InvoicePreview;
import { useState } from "react";
import DashboardLayout from "../../layout/DashboardLayout";
import Toast from "../../components/Toast";
import useToast from "../../hooks/useToast";

const paymentQueue = [
  {
    id: "FT-2026-0002",
    applicant: "Kuching Food Hub",
    type: "Shop Signage",
    invoiceNo: "INV-2026-0002",
    amount: "RM 500.00",
    status: "Pending Payment",
  },
];

const banks = [
  { name: "Maybank", url: "https://www.maybank2u.com.my" },
  { name: "CIMB Bank", url: "https://www.cimbclicks.com.my" },
  { name: "Public Bank", url: "https://www.pbebank.com" },
  { name: "RHB Bank", url: "https://logon.rhb.com.my" },
  { name: "Hong Leong Bank", url: "https://www.hlb.com.my" },
  { name: "AmBank", url: "https://ambank.amonline.com.my" },
  { name: "Bank Islam", url: "https://www.bankislam.biz" },
  { name: "Bank Rakyat", url: "https://www.irakyat.com.my" },
  { name: "BSN (Bank Simpanan Nasional)", url: "https://www.mybsn.com.my" },
  { name: "Affin Bank", url: "https://rib.affinonline.com" },
  { name: "Alliance Bank", url: "https://www.allianceonline.com.my" },
  { name: "OCBC Bank", url: "https://www.ocbc.com.my" },
  { name: "UOB Bank", url: "https://pib.uob.com.my" },
  { name: "Standard Chartered", url: "https://www.sc.com/my" },
  { name: "HSBC Bank", url: "https://www.hsbc.com.my" },
  { name: "Citibank", url: "https://www.citibank.com.my" },
  { name: "Agrobank", url: "https://www.agrobank.com.my" },
  { name: "Bank Muamalat", url: "https://www.muamalat.com.my" },
];

function PaymentPage() {
  const [method, setMethod] = useState("");
  const [selectedBank, setSelectedBank] = useState("");

  const { toast, showToast, hideToast } = useToast();

  const selectedBankData = banks.find((bank) => bank.name === selectedBank);

  function handleRedirectBank() {
    if (!selectedBankData) {
      showToast("Please select a bank first", "warning");
      return;
    }

    showToast(`Redirecting to ${selectedBankData.name}...`, "success");

    setTimeout(() => {
      window.open(selectedBankData.url, "_blank");
    }, 500);
  }

  function handleBankIslamRedirect() {
    showToast("Redirecting to Bank Islam...", "success");

    setTimeout(() => {
      window.open("https://www.bankislam.biz", "_blank");
    }, 500);
  }

  function handleConfirmPayment() {
    showToast("Payment confirmation submitted successfully", "success");
  }

  return (
    <DashboardLayout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          Payment Management
        </p>
        <h1 className="text-2xl font-bold text-[#1a1c1c]">Payment</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-4xl">
          Generate invoices, process online payment, upload payment proof, and
          confirm payment before digital license issuance.
        </p>
      </div>

      <Panel
        title="Payment Queue"
        description="Approved applications waiting for payment completion."
        className="mb-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-[#f1f5f4] text-slate-600">
              <tr>
                <TableHead>Application ID</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>License Type</TableHead>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </tr>
            </thead>

            <tbody>
              {paymentQueue.map((item) => (
                <tr key={item.id} className="border-t hover:bg-[#fafafa]">
                  <TableCell strong>{item.id}</TableCell>
                  <TableCell>{item.applicant}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.invoiceNo}</TableCell>
                  <TableCell strong>{item.amount}</TableCell>
                  <TableCell>
                    <StatusBadge value={item.status} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel
          title="Payment Processing"
          description="Select payment method and proceed with payment confirmation."
        >
          <div className="space-y-4">
            <Field label="Payment Method">
              <select
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setSelectedBank("");
                }}
                className="form-input"
              >
                <option value="">Select Method</option>
                <option value="online-banking">Online Banking</option>
                <option value="bank-transfer">
                  Online Transfer to DBKU Bank Islam Account
                </option>
              </select>
            </Field>

            {method === "online-banking" && (
              <>
                <Field label="Select Bank">
                  <select
                    value={selectedBank}
                    onChange={(event) => setSelectedBank(event.target.value)}
                    className="form-input"
                  >
                    <option value="">Choose Bank</option>
                    {banks.map((bank) => (
                      <option key={bank.name}>{bank.name}</option>
                    ))}
                  </select>
                </Field>

                <button
                  type="button"
                  onClick={handleRedirectBank}
                  className="px-5 py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]"
                >
                  Proceed to Selected Bank
                </button>
              </>
            )}

            {method === "bank-transfer" && (
              <div className="border border-slate-200 bg-[#fafafa] rounded-md p-4">
                <p className="text-sm font-bold text-[#1a1c1c] mb-3">
                  DBKU Bank Transfer Details
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <Info label="Bank" value="Bank Islam" />
                  <Info label="Account Name" value="DBKU Official Account" />
                  <Info label="Account Number" value="1234567890" />
                  <Info label="Payment Reference" value="Application ID" />
                </div>

                <button
                  type="button"
                  onClick={handleBankIslamRedirect}
                  className="mt-4 px-5 py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]"
                >
                  Go to Bank Islam
                </button>
              </div>
            )}

            {method && (
              <>
                <Field label="Upload Payment Receipt">
                  <input
                    type="file"
                    className="form-input file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold"
                  />
                </Field>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    className="px-5 py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]"
                  >
                    Submit Payment Confirmation
                  </button>
                </div>
              </>
            )}
          </div>
        </Panel>

        <Panel
          title="Payment Notes"
          description="Important information for applicants and officers."
        >
          <div className="space-y-3 text-sm text-slate-600">
            <Notice
              title="Invoice Required"
              description="Payment can only be made after the system generates an invoice for an approved application."
            />
            <Notice
              title="Receipt Verification"
              description="Uploaded receipt must be reviewed before the digital license is issued."
            />
            <Notice
              title="License Issuance"
              description="The license QR and PDF can be generated after successful payment verification."
            />
          </div>
        </Panel>
      </section>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </DashboardLayout>
  );
}

function Panel({ title, description, children, className = "" }) {
  return (
    <section
      className={`bg-white border border-slate-200 rounded-md overflow-hidden ${className}`}
    >
      <div className="border-t-4 border-[#006d32] px-5 py-4 border-b border-slate-200">
        <h2 className="text-base font-bold text-[#1a1c1c]">{title}</h2>
        {description && (
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-400 font-semibold mb-1">
        {label}
      </p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Notice({ title, description }) {
  return (
    <div className="border border-slate-200 rounded-md px-4 py-3 bg-[#fafafa]">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
  );
}

function StatusBadge({ value }) {
  return (
    <span className="inline-flex px-2.5 py-1 rounded text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">
      {value}
    </span>
  );
}

function TableHead({ children }) {
  return (
    <th className="px-3 py-3 text-left text-xs font-bold uppercase border-r last:border-r-0 border-slate-200 whitespace-nowrap">
      {children}
    </th>
  );
}

function TableCell({ children, strong = false }) {
  return (
    <td
      className={`px-3 py-3 border-r last:border-r-0 border-slate-100 align-top ${
        strong ? "font-semibold text-slate-800" : "text-slate-600"
      }`}
    >
      {children}
    </td>
  );
}

export default PaymentPage;
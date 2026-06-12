import { Panel } from "../ui/SystemUI";

const workflowCards = [
  {
    titleKey: "admin.workflow.applicant",
    shortKey: "admin.workflow.applicantShort",
  },
  {
    titleKey: "admin.workflow.kuInitial",
    shortKey: "admin.workflow.kuInitialShort",
  },
  {
    titleKey: "admin.workflow.technicalUnits",
    shortKey: "admin.workflow.technicalUnitsShort",
  },
  {
    titleKey: "admin.workflow.iklTechnical",
    shortKey: "admin.workflow.iklTechnicalShort",
  },
  {
    titleKey: "admin.workflow.kuFinal",
    shortKey: "admin.workflow.kuFinalShort",
  },
  {
    titleKey: "admin.workflow.kbLes",
    shortKey: "admin.workflow.kbLesShort",
  },
  {
    titleKey: "admin.workflow.tpPgh",
    shortKey: "admin.workflow.tpPghShort",
  },
  {
    titleKey: "admin.workflow.mphlg",
    shortKey: "admin.workflow.mphlgShort",
  },
  {
    titleKey: "admin.workflow.ptUpload",
    shortKey: "admin.workflow.ptUploadShort",
  },
  {
    titleKey: "admin.workflow.applicantReceipt",
    shortKey: "admin.workflow.applicantReceiptShort",
  },
  {
    titleKey: "admin.workflow.ptIssue",
    shortKey: "admin.workflow.ptIssueShort",
  },
  {
    titleKey: "admin.workflow.applicantQr",
    shortKey: "admin.workflow.applicantQrShort",
  },
];

function OperationalWorkflowPanel({ t }) {
  const renderWorkflowNode = (item, index) => (
    <div className="h-full rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-300 bg-white px-2 text-[12px] font-semibold leading-none text-slate-900">
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold leading-5 text-slate-950">
            {t(item.titleKey)}
          </h3>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-600">
            {t(item.shortKey)}
          </p>
        </div>
      </div>
    </div>
  );

  const renderArrow = (key, direction = "right") => (
    <div
      key={key}
      className="flex items-center justify-center text-2xl text-slate-400"
      aria-hidden="true"
    >
      {direction === "left" ? <>&larr;</> : <>&rarr;</>}
    </div>
  );

  const renderMobileMap = () => (
    <div className="space-y-2 md:hidden">
      {workflowCards.map((item, index) => (
        <div key={item.titleKey}>
          {renderWorkflowNode(item, index)}
          {index < workflowCards.length - 1 && (
            <div className="flex justify-center py-1 text-lg text-slate-400" aria-hidden="true">
              &darr;
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderDesktopMap = () => {
    const rows = [
      [0, 1, 2],
      [5, 4, 3],
      [6, 7, 8],
      [11, 10, 9],
    ];

    return (
      <div className="hidden md:block">
        {rows.map((rowIndexes, rowIndex) => {
          const direction = rowIndex % 2 === 0 ? "right" : "left";
          const downColumnClass = rowIndex % 2 === 0 ? "col-start-5" : "col-start-1";

          return (
            <div key={rowIndexes.join("-")}>
              <div className="grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] items-stretch">
                {rowIndexes.flatMap((cardIndex, itemIndex) => {
                  const item = workflowCards[cardIndex];
                  const parts = [
                    <div key={item.titleKey}>
                      {renderWorkflowNode(item, cardIndex)}
                    </div>,
                  ];

                  if (itemIndex < rowIndexes.length - 1) {
                    parts.push(renderArrow(`${item.titleKey}-arrow`, direction));
                  }

                  return parts;
                })}
              </div>
              {rowIndex < rows.length - 1 && (
                <div className="grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] py-2">
                  <div
                    className={`${downColumnClass} flex justify-center text-2xl text-slate-400`}
                    aria-hidden="true"
                  >
                    &darr;
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Panel
      compact
      title={t("admin.workflow.title")}
      description={t("admin.workflow.description")}
    >
      {renderMobileMap()}
      {renderDesktopMap()}
    </Panel>
  );
}

export default OperationalWorkflowPanel;

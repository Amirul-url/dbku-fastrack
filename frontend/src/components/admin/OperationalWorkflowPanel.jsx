import { Panel } from "../ui/SystemUI";

const workflowCards = [
  {
    titleKey: "admin.workflow.screening",
    descriptionKey: "admin.workflow.screeningDesc",
    shortKey: "admin.workflow.screeningShort",
  },
  {
    titleKey: "admin.workflow.technical",
    descriptionKey: "admin.workflow.technicalDesc",
    shortKey: "admin.workflow.technicalShort",
  },
  {
    titleKey: "admin.workflow.management",
    descriptionKey: "admin.workflow.managementDesc",
    shortKey: "admin.workflow.managementShort",
  },
  {
    titleKey: "admin.workflow.payment",
    descriptionKey: "admin.workflow.paymentDesc",
    shortKey: "admin.workflow.paymentShort",
  },
  {
    titleKey: "admin.workflow.renewal",
    descriptionKey: "admin.workflow.renewalDesc",
    shortKey: "admin.workflow.renewalShort",
  },
];

function OperationalWorkflowPanel({ t }) {
  const renderWorkflowCard = (item, index) => (
    <div className="h-full rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-slate-300 bg-white px-2 text-sm font-semibold leading-none text-slate-900">
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
            {t(item.titleKey)}
          </h3>
          <p className="mt-2 text-[14px] leading-6 text-slate-600">
            {t(item.shortKey, t(item.descriptionKey))}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <Panel title={t("admin.workflow.title")} description={t("admin.workflow.description")}>
      <div className="lg:hidden">
        <div className="space-y-2">
          {workflowCards.map((item, index) => (
            <div key={item.titleKey}>
              {renderWorkflowCard(item, index)}
              {index < workflowCards.length - 1 && (
                <div className="flex justify-center py-1 text-xl text-slate-400">
                  &darr;
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)_56px_minmax(0,1fr)] grid-rows-[auto_44px_auto] items-stretch">
          <div className="col-start-1 row-start-1">
            {renderWorkflowCard(workflowCards[0], 0)}
          </div>
          <div className="col-start-2 row-start-1 flex items-center justify-center text-3xl text-slate-400">
            &rarr;
          </div>
          <div className="col-start-3 row-start-1">
            {renderWorkflowCard(workflowCards[1], 1)}
          </div>
          <div className="col-start-4 row-start-1 flex items-center justify-center text-3xl text-slate-400">
            &rarr;
          </div>
          <div className="col-start-5 row-start-1">
            {renderWorkflowCard(workflowCards[2], 2)}
          </div>

          <div className="col-start-5 row-start-2 flex items-center justify-center text-3xl text-slate-400">
            &darr;
          </div>

          <div className="col-start-3 row-start-3">
            {renderWorkflowCard(workflowCards[4], 4)}
          </div>
          <div className="col-start-4 row-start-3 flex items-center justify-center text-3xl text-slate-400">
            &larr;
          </div>
          <div className="col-start-5 row-start-3">
            {renderWorkflowCard(workflowCards[3], 3)}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default OperationalWorkflowPanel;

import { Icon, Panel } from "../ui/SystemUI";

const workflowCards = [
  {
    titleKey: "admin.workflow.screening",
    descriptionKey: "admin.workflow.screeningDesc",
    icon: "rule",
  },
  {
    titleKey: "admin.workflow.technical",
    descriptionKey: "admin.workflow.technicalDesc",
    icon: "engineering",
  },
  {
    titleKey: "admin.workflow.management",
    descriptionKey: "admin.workflow.managementDesc",
    icon: "check_circle",
  },
  {
    titleKey: "admin.workflow.payment",
    descriptionKey: "admin.workflow.paymentDesc",
    icon: "receipt_long",
  },
  {
    titleKey: "admin.workflow.renewal",
    descriptionKey: "admin.workflow.renewalDesc",
    icon: "event_repeat",
  },
];

function OperationalWorkflowPanel({ t }) {
  return (
    <Panel title={t("admin.workflow.title")} description={t("admin.workflow.description")}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        {workflowCards.map((item) => (
          <div key={item.titleKey} className="rounded-md border border-slate-200 bg-white p-3">
            <Icon name={item.icon} className="text-2xl text-emerald-700" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950">
              {t(item.titleKey)}
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {t(item.descriptionKey)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default OperationalWorkflowPanel;

import { getApplicantName, normalizeStatus } from "./workflow";

export async function enrichApplicationListApplicantNames(applications, fetchApplication) {
  if (!Array.isArray(applications) || applications.length === 0) return applications;

  const needsDetail = applications.filter((application) => {
    return (
      application?.id &&
      (getApplicantName(application) === "Applicant" ||
        needsCompletedApplicationDetail(application))
    );
  });

  if (needsDetail.length === 0) return applications;

  const details = await Promise.all(
    needsDetail.map(async (application) => {
      try {
        return await fetchApplication(application.id);
      } catch {
        return null;
      }
    })
  );
  const detailById = new Map(
    details
      .filter(Boolean)
      .map((detail) => [String(detail.id), detail])
  );

  return applications.map((application) => {
    const detail = detailById.get(String(application.id));
    return detail ? { ...application, ...detail } : application;
  });
}

function needsCompletedApplicationDetail(application) {
  return (
    normalizeStatus(application?.status) === "license_issued" &&
    !application?.form_data
  );
}

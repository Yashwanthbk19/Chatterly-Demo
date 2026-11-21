import ReleaseChecklist from "../models/ReleaseChecklist.js";
import Bug from "../models/Bug.js";
import LoadTest from "../models/LoadTest.js";

// Helpers
const getChecklist = () =>
    ReleaseChecklist.findOne();

const updateChecklist = (data) =>
    ReleaseChecklist.findOneAndUpdate(
        {},
        data,
        {
            returnDocument: "after",
            upsert: true,
            runValidators: true,
        }
    );

// Get release checklist
export const getReleaseChecklist = async () => {
    if (!(await getChecklist())) {
        await ReleaseChecklist.create({});
    }

    const [
        unresolvedCriticalBugs,
        latestLoadTest,
    ] = await Promise.all([
        Bug.countDocuments({
            severity: "Critical",
            status: {
                $ne: "Resolved",
            },
        }),

        LoadTest.findOne()
            .sort({
                createdAt: -1,
            }),
    ]);

    const criticalBugsFixed = unresolvedCriticalBugs === 0;
    const loadTestingPassed = latestLoadTest?.status === "completed";

    return await updateChecklist({
        criticalBugsFixed,
        loadTestingPassed
    });
};

// Update manual checklist
export const updateReleaseChecklist = async (data) => {
    return await updateChecklist({
        securityAuditApproved: data.securityAuditApproved,

        backupRecoveryTested: data.backupRecoveryTested,

        monitoringAlertsConfigured: data.monitoringAlertsConfigured,

        approvalStatus: data.approvalStatus,

        rollbackPlan: data.rollbackPlan
    });
};

// Validation
export const validateRelease = async () => {
    const checklist = await getReleaseChecklist();

    const readyForRelease = [
        checklist.criticalBugsFixed,

        checklist.loadTestingPassed,

        checklist.securityAuditApproved,

        checklist.backupRecoveryTested,

        checklist.monitoringAlertsConfigured,

        checklist.approvalStatus === "Approved"
    ].every(Boolean);

    return {
        ...checklist.toObject(),
        buildVersion: process.env.APP_VERSION,
        readyForRelease
    };
};

// Go live
export const goLive = async () => {
    const validation = await validateRelease();

    if (!validation.readyForRelease) {
        throw new Error(
            "Release is not ready for deployment."
        );
    }

    return await updateChecklist({
        releaseStatus: "Live",
        releasedAt: new Date()
    });
};

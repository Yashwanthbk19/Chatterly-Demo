import { requestResult } from './client';

// Sprint 12 | Story 1 — Production Dashboard (Overview Screen).
// Wrappers around the admin monitoring endpoints mounted at /api/system-admin
// (documented in docs/api.md §114+). Story 1 uses the overview endpoint and
// Story 2 uses the performance overview and optimization endpoints below.
//
// The endpoints are auth-protected (authMiddleware); the axios instance attaches
// the stored Bearer token automatically. Errors are surfaced inline by the
// dashboard page, so global error toasts are skipped.

// Coerce a value the API returns as a number (it may arrive as a numeric string)
// into a real number, or null when it is genuinely absent/unparseable — so the
// UI can tell "0" apart from "no data".
const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// §114 — Dashboard overview. Returns the five production-readiness metrics:
// { serverStatus, avgResponseTime, activeUsers, errorRate, buildVersion }.
export const getProductionDashboard = () =>
  requestResult(
    {
      method: 'get',
      url: '/api/system-admin/dashboard',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load the production dashboard.',
      transform: (payload) => ({
        serverStatus: String(payload?.serverStatus || '').trim(),
        avgResponseTime: toFiniteNumber(payload?.avgResponseTime),
        activeUsers: toFiniteNumber(payload?.activeUsers),
        errorRate: toFiniteNumber(payload?.errorRate),
        buildVersion: String(payload?.buildVersion || '').trim(),
      }),
    }
  );

// §115 — Live metrics for the Performance Optimization tab.
export const getPerformanceOverview = () =>
  requestResult(
    {
      method: 'get',
      url: '/api/system-admin/performance',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load performance metrics.',
      transform: (payload) => ({
        apiResponseTime: toFiniteNumber(payload?.apiResponseTime),
        dbLatency: toFiniteNumber(payload?.dbLatency),
        slowQueries: toFiniteNumber(payload?.slowQueries),
        mediaCompression: String(payload?.mediaCompression || '').trim(),
        cdnStatus: String(payload?.cdnStatus || '').trim(),
      }),
    }
  );

// §116 — Reset accumulated metrics and begin a fresh measurement window.
export const optimizePerformance = () =>
  requestResult(
    {
      method: 'post',
      url: '/api/system-admin/performance/optimize',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'System optimization failed.',
      transform: () => null,
    }
  );

const normalizeLoadTest = (test = {}) => ({
  _id: String(test?._id || '').trim(),
  requestedUsers: toFiniteNumber(test?.requestedUsers),
  duration: toFiniteNumber(test?.duration),
  maxUsersHandled: toFiniteNumber(test?.maxUsersHandled),
  crashEvents: toFiniteNumber(test?.crashEvents),
  avgCpuUsage: toFiniteNumber(test?.avgCpuUsage),
  memoryUsage: String(test?.memoryUsage || '').trim(),
  status: String(test?.status || '').trim().toLowerCase(),
  startedAt: test?.startedAt || null,
  completedAt: test?.completedAt || null,
});

// Sections 117-118 - create a load test, then retrieve its persisted result.
export const createLoadTest = ({ requestedUsers, duration }) =>
  requestResult(
    {
      method: 'post',
      url: '/api/system-admin/loadtest',
      data: { requestedUsers, duration },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to start the load test.',
      transform: normalizeLoadTest,
    }
  );

export const getLoadTestResult = (loadTestId) =>
  requestResult(
    {
      method: 'get',
      url: `/api/system-admin/loadtest/${encodeURIComponent(loadTestId)}`,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to fetch the load test result.',
      transform: normalizeLoadTest,
    }
  );

const normalizeAnalyticsSnapshot = (snapshot = {}) => ({
  dailyActiveUsers: toFiniteNumber(snapshot?.dailyActiveUsers),
  messageDeliveryRate: toFiniteNumber(snapshot?.messageDeliveryRate),
  callSuccessRate: toFiniteNumber(snapshot?.callSuccessRate),
  notificationSuccessRate: toFiniteNumber(snapshot?.notificationSuccessRate),
  crashReports: toFiniteNumber(snapshot?.crashReports),
  androidUsers: toFiniteNumber(snapshot?.androidUsers),
  iosUsers: toFiniteNumber(snapshot?.iosUsers),
  snapshotDate: snapshot?.snapshotDate || snapshot?.createdAt || null,
  appVersion: String(snapshot?.appVersion || '').trim(),
});

// Sections 93-95 - generated monitoring analytics snapshots. These endpoints
// already exist in the backend, so the Monitoring & Analytics dashboard consumes
// them when available and falls back to frontend mock data for missing fields.
export const generateMonitoringAnalyticsSnapshot = () =>
  requestResult(
    {
      method: 'post',
      url: '/api/system-admin/analytics/generate',
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to generate monitoring analytics.',
      transform: normalizeAnalyticsSnapshot,
    }
  );

export const getMonitoringAnalyticsDashboard = () =>
  requestResult(
    {
      method: 'get',
      url: '/api/system-admin/analytics/dashboard',
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load monitoring analytics.',
      transform: normalizeAnalyticsSnapshot,
    }
  );

export const getMonitoringAnalyticsHistory = () =>
  requestResult(
    {
      method: 'get',
      url: '/api/system-admin/analytics/export',
      skipGlobalLoading: true,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load monitoring analytics history.',
      transform: (payload) => (Array.isArray(payload) ? payload : []).map(normalizeAnalyticsSnapshot),
    }
  );

const BUG_SEVERITIES = new Set(['Low', 'Medium', 'High', 'Critical']);

const normalizeBug = (bug = {}) => ({
  _id: String(bug?._id || '').trim(),
  id: bug?.id ?? '',
  issue: String(bug?.issue || '').trim(),
  description: String(bug?.description || '').trim(),
  status: String(bug?.status || 'Open').trim(),
  severity: String(bug?.severity || '').trim(),
  assignedDeveloper: String(bug?.assignedDeveloper || '').trim(),
  resolvedAt: bug?.resolvedAt || null,
  createdAt: bug?.createdAt || null,
  updatedAt: bug?.updatedAt || null,
});

// Sections 119-121 - create, list, and server-side severity filtering.
export const getBugReports = (severity = '') => {
  const normalizedSeverity = String(severity || '').trim();

  return requestResult(
    {
      method: 'get',
      url: '/api/system-admin/bugs',
      params: BUG_SEVERITIES.has(normalizedSeverity)
        ? { severity: normalizedSeverity }
        : undefined,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load critical bug reports.',
      transform: (payload) => (Array.isArray(payload) ? payload : []).map(normalizeBug),
    }
  );
};

export const createBugReport = ({ issue, description, severity }) =>
  requestResult(
    {
      method: 'post',
      url: '/api/system-admin/bugs',
      data: { issue, description, severity },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to create the bug report.',
      transform: normalizeBug,
    }
  );

// Section 122 - assigning a developer also moves the issue to In Progress.
export const assignBugDeveloper = (bugId, assignedDeveloper) =>
  requestResult(
    {
      method: 'patch',
      url: `/api/system-admin/bugs/${encodeURIComponent(bugId)}/assign`,
      data: { assignedDeveloper },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to assign the developer.',
      transform: normalizeBug,
    }
  );

// Section 123 - resolve a bug by its public numeric id.
export const resolveBugReport = (bugId) =>
  requestResult(
    {
      method: 'patch',
      url: `/api/system-admin/bugs/${encodeURIComponent(bugId)}/resolve`,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to mark the bug as resolved.',
      transform: normalizeBug,
    }
  );

const normalizeReleaseChecklist = (payload = {}) => ({
  _id: String(payload?._id || '').trim(),
  criticalBugsFixed: Boolean(payload?.criticalBugsFixed),
  loadTestingPassed: Boolean(payload?.loadTestingPassed),
  securityAuditApproved: Boolean(payload?.securityAuditApproved),
  backupRecoveryTested: Boolean(payload?.backupRecoveryTested),
  monitoringAlertsConfigured: Boolean(payload?.monitoringAlertsConfigured),
  approvalStatus: String(payload?.approvalStatus || 'Pending').trim(),
  releaseStatus: String(payload?.releaseStatus || 'Pending').trim(),
  rollbackPlan: String(payload?.rollbackPlan || ''),
  releasedAt: payload?.releasedAt || null,
  updatedAt: payload?.updatedAt || null,
  buildVersion: String(payload?.buildVersion || '').trim(),
  readyForRelease: Boolean(payload?.readyForRelease),
});

// Sections 96-99 - release readiness. The backend derives the critical-bug and
// load-test gates; the remaining criteria and approval are managed here.
export const getReleaseChecklist = () =>
  requestResult(
    {
      method: 'get',
      url: '/api/system-admin/release',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load the launch approval gate.',
      transform: normalizeReleaseChecklist,
    }
  );

export const updateReleaseChecklist = (checklist) =>
  requestResult(
    {
      method: 'patch',
      url: '/api/system-admin/release',
      data: {
        securityAuditApproved: Boolean(checklist?.securityAuditApproved),
        backupRecoveryTested: Boolean(checklist?.backupRecoveryTested),
        monitoringAlertsConfigured: Boolean(checklist?.monitoringAlertsConfigured),
        approvalStatus: String(checklist?.approvalStatus || 'Pending'),
        rollbackPlan: String(checklist?.rollbackPlan || ''),
      },
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to update the release checklist.',
      transform: normalizeReleaseChecklist,
    }
  );

export const validateReleaseChecklist = () =>
  requestResult(
    {
      method: 'post',
      url: '/api/system-admin/release/validate',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to validate the release checklist.',
      transform: normalizeReleaseChecklist,
    }
  );

export const goLiveRelease = () =>
  requestResult(
    {
      method: 'post',
      url: '/api/system-admin/release/go-live',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to deploy the release.',
      transform: normalizeReleaseChecklist,
    }
  );

// There is no logs endpoint anywhere in the API, so [View Logs] has no backend.

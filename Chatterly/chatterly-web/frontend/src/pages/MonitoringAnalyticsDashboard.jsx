import React, { useEffect, useMemo, useState } from 'react';
import {
  LuCalendar,
  LuClock3,
  LuDownload,
  LuExpand,
  LuInfo,
  LuServer,
} from 'react-icons/lu';
import {
  MONITORING_ANALYTICS_DATA,
  MONITORING_ANALYTICS_RANGE_OPTIONS,
} from '../constants/monitoringAnalytics';
import {
  generateMonitoringAnalyticsSnapshot,
  getMonitoringAnalyticsDashboard,
  getMonitoringAnalyticsHistory,
} from '../api/systemAdmin';

const IST_TIME_ZONE = 'Asia/Kolkata';

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundOneDecimal = (value) => Math.round(value * 10) / 10;

const formatPercent = (value) => `${roundOneDecimal(Number(value) || 0).toFixed(1)}%`;

const formatCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatHistoryDay = (value, fallback) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: IST_TIME_ZONE,
  });
};

const formatIstDate = (date) =>
  date.toLocaleDateString('en-US', {
    timeZone: IST_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatIstTime = (date) =>
  date.toLocaleTimeString('en-US', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const getLatestSnapshotFromHistory = (history) => {
  if (!Array.isArray(history) || history.length === 0) return null;
  return [...history]
    .filter((item) => item && typeof item === 'object')
    .sort((first, second) => new Date(second.snapshotDate || 0) - new Date(first.snapshotDate || 0))[0] || null;
};

// Sprint 12 - Story 5: derive the per-build install split from whatever the
// snapshots report. Backend snapshots carry a single `appVersion` plus platform
// user counts, so group the history by version and fall back to the mock split
// when the backend has not reported versioned data yet.
const buildAppVersionDistribution = ({ snapshot, history }) => {
  const snapshots = [
    ...(Array.isArray(history) ? history : []),
    ...(snapshot ? [snapshot] : []),
  ].filter((item) => item && typeof item === 'object');

  const usersByVersion = new Map();
  snapshots.forEach((item) => {
    const version = String(item?.appVersion || '').trim();
    if (!version) return;
    const users =
      (toFiniteNumber(item?.androidUsers) || 0) + (toFiniteNumber(item?.iosUsers) || 0);
    if (users <= 0) return;
    usersByVersion.set(version, Math.max(usersByVersion.get(version) || 0, users));
  });

  const totalUsers = [...usersByVersion.values()].reduce((sum, users) => sum + users, 0);
  if (!totalUsers) return MONITORING_ANALYTICS_DATA.appVersionDistribution;

  return [...usersByVersion.entries()]
    .map(([version, users]) => ({
      version,
      users,
      percentage: roundOneDecimal((users / totalUsers) * 100),
    }))
    .sort((first, second) => second.users - first.users);
};

const applySnapshotToScreenData = ({ snapshot, history }) => {
  const nextData = {
    ...MONITORING_ANALYTICS_DATA,
    deliveryMetrics: MONITORING_ANALYTICS_DATA.deliveryMetrics.map((metric) => ({ ...metric })),
    dailyActiveUsers: MONITORING_ANALYTICS_DATA.dailyActiveUsers.map((item) => ({ ...item })),
    crashReportsTrend: MONITORING_ANALYTICS_DATA.crashReportsTrend.map((item) => ({ ...item })),
  };

  const crashReports = toFiniteNumber(snapshot?.crashReports);
  if (crashReports !== null) {
    nextData.crashReportsToday = crashReports;
  }

  const crashHistory = (Array.isArray(history) ? history : [])
    .filter((item) => toFiniteNumber(item?.crashReports) !== null)
    .sort((first, second) => new Date(first.snapshotDate || 0) - new Date(second.snapshotDate || 0))
    .slice(-7);

  if (crashHistory.length > 0) {
    nextData.crashReportsTrend = crashHistory.map((item, index) => ({
      day: formatHistoryDay(item.snapshotDate, `Day ${index + 1}`),
      crashes: toFiniteNumber(item.crashReports) || 0,
    }));
  }

  nextData.appVersionDistribution = buildAppVersionDistribution({ snapshot, history });

  const successRateByMetricId = {
    messageDeliverySuccessRate: snapshot?.messageDeliveryRate,
    callSuccessRate: snapshot?.callSuccessRate,
    notificationSuccessRate: snapshot?.notificationSuccessRate,
  };

  nextData.deliveryMetrics = nextData.deliveryMetrics.map((metric) => {
    const apiValue = toFiniteNumber(successRateByMetricId[metric.id]);
    return apiValue === null ? metric : { ...metric, value: apiValue };
  });

  const apiHistory = (Array.isArray(history) ? history : [])
    .filter((item) => toFiniteNumber(item?.dailyActiveUsers) !== null)
    .sort((first, second) => new Date(first.snapshotDate || 0) - new Date(second.snapshotDate || 0))
    .slice(-7);

  if (apiHistory.length > 0) {
    nextData.dailyActiveUsers = apiHistory.map((item, index) => ({
      day: formatHistoryDay(item.snapshotDate, `Day ${index + 1}`),
      users: toFiniteNumber(item.dailyActiveUsers) || 0,
    }));
  } else {
    const dailyActiveUsers = toFiniteNumber(snapshot?.dailyActiveUsers);
    if (dailyActiveUsers !== null) {
      nextData.dailyActiveUsers = nextData.dailyActiveUsers.map((item, index, items) =>
        index === items.length - 1 ? { ...item, users: dailyActiveUsers } : item
      );
    }
  }

  return nextData;
};

const buildMonitoringAnalyticsCsv = ({ data, history, rangeLabel }) => {
  const rows = [
    ['Section', 'Metric', 'Value'],
    ['Range', 'Selected range', rangeLabel],
    ...data.deliveryMetrics.map((metric) => [
      'Success Rates',
      metric.label,
      formatPercent(metric.value),
    ]),
  ];

  const historicalRows = (Array.isArray(history) && history.length > 0)
    ? history
        .filter((snapshot) => toFiniteNumber(snapshot?.dailyActiveUsers) !== null)
        .sort((first, second) => new Date(first.snapshotDate || 0) - new Date(second.snapshotDate || 0))
        .map((snapshot, index) => [
          'Daily Active Users',
          formatHistoryDay(snapshot.snapshotDate, `Snapshot ${index + 1}`),
          snapshot.dailyActiveUsers,
        ])
    : data.dailyActiveUsers.map((item) => ['Daily Active Users', item.day, item.users]);

  const crashRows = [
    ['Crash Reports', 'Crash reports today', data.crashReportsToday],
    ...(Array.isArray(data.crashReportsTrend) ? data.crashReportsTrend : []).map((item) => [
      'Crash Reports',
      item.day,
      item.crashes,
    ]),
  ];

  const versionRows = (Array.isArray(data.appVersionDistribution) ? data.appVersionDistribution : []).map(
    (item) => ['App Version Distribution', item.version, `${formatPercent(item.percentage)} (${item.users} users)`]
  );

  return [...rows, ...historicalRows, ...crashRows, ...versionRows]
    .map((row) => row.map(formatCsvValue).join(','))
    .join('\n');
};

const SuccessRateCard = ({ metric }) => (
  <section className="min-h-[134px] overflow-hidden rounded-[9px] border border-[#E7EBF2] bg-white">
    <div className="flex h-[47px] items-center justify-between gap-3 border-b border-[#E7EBF2] px-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[#1E293B]">
        <LuServer className="h-[14px] w-[14px] flex-shrink-0 text-[#536274]" aria-hidden="true" />
        <span className="truncate">{metric.label}</span>
      </div>
      <span className="rounded-[4px] bg-[#EAFBF1] px-2.5 py-1 text-[12px] font-medium text-[#057A55]">
        Healthy
      </span>
    </div>
    <div className="px-3 pb-4 pt-4">
      <p className="text-[19px] font-extrabold leading-none text-[#0F172A]">{formatPercent(metric.value)}</p>
      <p className="mt-6 text-[13px] leading-5 text-[#25364D]">{metric.detail}</p>
    </div>
  </section>
);

const DailyActiveUsersChart = ({ data, expanded = false }) => {
  const values = data.map((item) => Number(item.users) || 0);
  const maxValue = Math.max(40, ...values);
  const yMax = Math.ceil(maxValue / 10) * 10;
  const width = 920;
  const height = expanded ? 380 : 236;
  const pad = { left: 48, right: 22, top: 20, bottom: 36 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xAt = (index) =>
    data.length <= 1 ? pad.left + plotWidth / 2 : pad.left + (index / (data.length - 1)) * plotWidth;
  const yAt = (value) => pad.top + plotHeight - ((Number(value) || 0) / yMax) * plotHeight;
  const points = data.map((item, index) => ({ ...item, x: xAt(index), y: yAt(item.users) }));
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPath = `M${linePoints} L${points[points.length - 1]?.x || pad.left},${pad.top + plotHeight} L${points[0]?.x || pad.left},${pad.top + plotHeight} Z`;
  const ticks = yMax === 40
    ? [40, 30, 20, 10, 0]
    : [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0].map((tick) => Math.round(tick));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={expanded ? 'h-[420px] w-full' : 'h-[220px] w-full'}
      role="img"
      aria-label="Daily active users for the last seven days"
    >
      <defs>
        <linearGradient id={expanded ? 'dauFillExpanded' : 'dauFill'} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => {
        const y = yAt(tick);
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#ECF0F6" strokeWidth="1" />
            <text x={pad.left - 14} y={y + 4} textAnchor="end" fontSize="11" fill="#536A86">
              {tick}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill={`url(#${expanded ? 'dauFillExpanded' : 'dauFill'})`} />
      <polyline points={linePoints} fill="none" stroke="#8B5CF6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <g key={`${point.day}-${index}`}>
          <circle cx={point.x} cy={point.y} r="3.4" fill="#5B21D7" />
          {index > 0 ? (
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F172A">
              {point.users}
            </text>
          ) : null}
          <text x={point.x} y={height - 10} textAnchor="middle" fontSize="10" fontWeight="500" fill="#536A86">
            {point.day}
          </text>
        </g>
      ))}
    </svg>
  );
};

const DailyActiveUsersPanel = ({ data, onExpand }) => (
  <section className="rounded-[13px] border border-[#E7EBF2] bg-white px-5 pb-4 pt-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-extrabold leading-none text-[#0F172A]">Daily Active Users</h2>
        <p className="mt-3 inline-flex rounded-[4px] bg-[#F0E8FF] px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9]">
          {data[data.length - 1]?.users || 0} users today
        </p>
      </div>
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex h-[31px] items-center justify-center gap-2 rounded-[7px] border border-[#E7EBF2] bg-white px-3 text-[11px] font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
      >
        <LuExpand className="h-[13px] w-[13px] text-[#536274]" aria-hidden="true" />
        Expand Full Graph
      </button>
    </div>
    <div className="mt-4">
      <DailyActiveUsersChart data={data} />
    </div>
  </section>
);

// Sprint 12 - Story 5: Crash Reports.
const CrashReportsPanel = ({ crashReportsToday, trend }) => {
  const points = Array.isArray(trend) ? trend : [];
  const peak = Math.max(1, ...points.map((item) => Number(item.crashes) || 0));
  const weekTotal = points.reduce((sum, item) => sum + (Number(item.crashes) || 0), 0);
  const isHealthy = Number(crashReportsToday) <= 5;

  return (
    <section className="rounded-[13px] border border-[#E7EBF2] bg-white px-5 pb-5 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold leading-none text-[#0F172A]">Crash Reports</h2>
          <p className="mt-2 text-[12px] leading-4 text-[#536A86]">Client crashes reported over the last 7 days.</p>
        </div>
        <span
          className={`flex-shrink-0 rounded-[4px] px-2.5 py-1 text-[12px] font-medium ${
            isHealthy ? 'bg-[#EAFBF1] text-[#057A55]' : 'bg-[#FEF2F2] text-[#B42318]'
          }`}
        >
          {isHealthy ? 'Stable' : 'Needs attention'}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-5">
        <div>
          <p className="text-[26px] font-extrabold leading-none text-[#0F172A]">{Number(crashReportsToday) || 0}</p>
          <p className="mt-1.5 text-[12px] text-[#536A86]">Today</p>
        </div>
        <div className="border-l border-[#E7EBF2] pl-5">
          <p className="text-[26px] font-extrabold leading-none text-[#0F172A]">{weekTotal}</p>
          <p className="mt-1.5 text-[12px] text-[#536A86]">Last 7 days</p>
        </div>
      </div>

      <ul className="mt-5 flex items-end justify-between gap-2" aria-label="Crash reports per day">
        {points.map((item, index) => {
          const value = Number(item.crashes) || 0;
          return (
            <li key={`${item.day}-${index}`} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[11px] font-semibold text-[#0F172A]">{value}</span>
              <span
                className="w-full rounded-[3px] bg-[#F0A0A0]"
                style={{ height: `${Math.max(4, Math.round((value / peak) * 56))}px` }}
                aria-hidden="true"
              />
              <span className="text-[10px] font-medium text-[#536A86]">{item.day}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

// Sprint 12 - Story 5: App Version Distribution.
const AppVersionDistributionPanel = ({ distribution }) => {
  const rows = Array.isArray(distribution) ? distribution : [];
  const barColors = ['#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE'];

  return (
    <section className="rounded-[13px] border border-[#E7EBF2] bg-white px-5 pb-5 pt-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-extrabold leading-none text-[#0F172A]">App Version Distribution</h2>
        <p className="mt-2 text-[12px] leading-4 text-[#536A86]">Share of active installs on each released build.</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 text-[12px] text-[#536A86]">No version data reported yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3.5">
          {rows.map((item, index) => (
            <li key={item.version}>
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate font-semibold text-[#0F172A]">{item.version}</span>
                <span className="flex-shrink-0 text-[#536A86]">
                  {formatPercent(item.percentage)}
                  {Number(item.users) > 0 ? ` • ${Number(item.users).toLocaleString('en-US')} users` : ''}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#F1F4F9]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.min(100, Number(item.percentage) || 0))}%`,
                    backgroundColor: barColors[index % barColors.length],
                  }}
                  aria-hidden="true"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const GraphDialog = ({ data, onClose }) => (
  <div
    className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/45 px-5"
    role="dialog"
    aria-modal="true"
    aria-labelledby="daily-users-dialog-title"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div className="w-full max-w-[980px] rounded-[13px] bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-4">
        <h3 id="daily-users-dialog-title" className="text-[16px] font-extrabold text-[#0F172A]">
          Daily Active Users
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close full graph"
          className="h-8 w-8 rounded-[7px] text-[20px] leading-none text-[#536274] hover:bg-[#F8FAFC]"
        >
          x
        </button>
      </div>
      <div className="mt-4 rounded-[10px] border border-[#E7EBF2] p-4">
        <DailyActiveUsersChart data={data} expanded />
      </div>
    </div>
  </div>
);

export default function MonitoringAnalyticsDashboard({ onExportSuccess }) {
  const [selectedRange, setSelectedRange] = useState(MONITORING_ANALYTICS_RANGE_OPTIONS[0].value);
  const [dashboardData, setDashboardData] = useState(MONITORING_ANALYTICS_DATA);
  const [historyData, setHistoryData] = useState([]);
  const [apiStatus, setApiStatus] = useState('loading');
  const [apiNotice, setApiNotice] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showExpandedGraph, setShowExpandedGraph] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const selectedRangeLabel = useMemo(
    () => MONITORING_ANALYTICS_RANGE_OPTIONS.find((option) => option.value === selectedRange)?.label || 'Last 7 Days',
    [selectedRange]
  );

  useEffect(() => {
    let isCancelled = false;

    const loadAnalytics = async () => {
      try {
        const generatedResult = await generateMonitoringAnalyticsSnapshot()
          .then((result) => ({ status: 'fulfilled', value: result }))
          .catch((error) => ({ status: 'rejected', reason: error }));

        const [dashboardResult, historyResult] = await Promise.allSettled([
          generatedResult.status === 'fulfilled'
            ? Promise.resolve(generatedResult.value)
            : getMonitoringAnalyticsDashboard(),
          getMonitoringAnalyticsHistory(),
        ]);

        if (isCancelled) return;

        const history = historyResult.status === 'fulfilled' ? historyResult.value?.data : [];
        const snapshot = dashboardResult.status === 'fulfilled'
          ? dashboardResult.value?.data
          : getLatestSnapshotFromHistory(history);

        setHistoryData(Array.isArray(history) ? history : []);

        if (!snapshot && !(Array.isArray(history) && history.length > 0)) {
          setDashboardData(MONITORING_ANALYTICS_DATA);
          setApiStatus('empty');
          setApiNotice('No analytics data available from the backend yet. Showing mock data.');
          return;
        }

        setDashboardData(applySnapshotToScreenData({ snapshot, history }));
        setApiStatus('ready');

        if (historyResult.status === 'rejected') {
          setApiNotice('Latest analytics loaded. Historical DAU is using mock fallback.');
        } else {
          setApiNotice('');
        }
      } catch (error) {
        if (isCancelled) return;
        console.warn('Unable to load monitoring analytics:', error);
        setDashboardData(MONITORING_ANALYTICS_DATA);
        setHistoryData([]);
        setApiStatus('error');
        setApiNotice('No analytics data available. Showing mock data.');
      }
    };

    void loadAnalytics();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const tickerId = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(tickerId);
  }, []);

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const result = await getMonitoringAnalyticsHistory();
      const freshHistory = Array.isArray(result?.data) ? result.data : [];
      if (freshHistory.length > 0) setHistoryData(freshHistory);
      const csv = buildMonitoringAnalyticsCsv({
        data: dashboardData,
        history: freshHistory.length > 0 ? freshHistory : historyData,
        rangeLabel: selectedRangeLabel,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `chatterly-monitoring-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadLink.click();
      URL.revokeObjectURL(url);
      onExportSuccess?.('Monitoring analytics report exported.');
    } catch (error) {
      console.warn('Unable to export monitoring analytics:', error);
      const csv = buildMonitoringAnalyticsCsv({
        data: dashboardData,
        history: historyData,
        rangeLabel: selectedRangeLabel,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `chatterly-monitoring-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadLink.click();
      URL.revokeObjectURL(url);
      onExportSuccess?.('Monitoring analytics report exported from cached data.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh/var(--app-zoom,1)-56px)] flex-col bg-white">
      <main className="chatterly-monitoring-workspace flex-1 bg-white">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-[20px] font-extrabold leading-none text-[#0F172A]">Monitor &amp; Analytics</h1>
            <p className="mt-3 text-[13px] leading-5 text-[#475569]">
              Delivery health, reliability, notification performance, users, orders, and app distribution
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            <label className="relative block">
              <span className="sr-only">Select report range</span>
              <select
                value={selectedRange}
                onChange={(event) => setSelectedRange(event.target.value)}
                className="h-[34px] w-[103px] appearance-none rounded-[4px] border border-[#E7EBF2] bg-white pl-3 pr-8 text-[12px] font-medium text-[#0F172A] outline-none focus:border-[#8B5CF6]"
              >
                {MONITORING_ANALYTICS_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <LuCalendar className="pointer-events-none absolute right-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[#536274]" aria-hidden="true" />
            </label>
            <button
              type="button"
              onClick={handleExportReport}
              disabled={isExporting}
              className="inline-flex h-[34px] items-center justify-center gap-2 rounded-[4px] bg-[#8B5CF6] px-4 text-[12px] font-semibold text-white shadow-[0_5px_10px_rgba(124,58,237,0.28)] transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LuDownload className="h-[13px] w-[13px]" aria-hidden="true" />
              {isExporting ? 'Exporting...' : 'Export Report'}
            </button>
          </div>
        </div>

        {(apiStatus === 'loading' || apiNotice) ? (
          <div
            className="mt-[43px] flex h-[40px] items-center gap-3 rounded-[4px] bg-[#FFF8E6] px-4 text-[12px] font-medium text-[#9A3D0A]"
            role="status"
          >
            <span className="inline-flex h-[17px] w-[17px] items-center justify-center rounded-full bg-[#9A4D12] text-[11px] font-bold text-white">
              {apiStatus === 'loading' ? 'i' : '!'}
            </span>
            {apiStatus === 'loading' ? 'Loading analytics data...' : apiNotice}
          </div>
        ) : null}

        <div className="mt-3 grid gap-5 md:grid-cols-3">
          {dashboardData.deliveryMetrics.map((metric) => (
            <SuccessRateCard key={metric.id} metric={metric} />
          ))}
        </div>

        <div className="mt-5">
          <DailyActiveUsersPanel
            data={dashboardData.dailyActiveUsers}
            onExpand={() => setShowExpandedGraph(true)}
          />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <CrashReportsPanel
            crashReportsToday={dashboardData.crashReportsToday}
            trend={dashboardData.crashReportsTrend}
          />
          <AppVersionDistributionPanel distribution={dashboardData.appVersionDistribution} />
        </div>
      </main>

      <footer className="flex items-center justify-end gap-5 bg-white pb-5 pt-4 text-[12px] text-[#334155]">
        <span className="inline-flex items-center gap-2 text-[#16A34A]">
          <span className="h-2 w-2 rounded-full bg-[#12B981]" aria-hidden="true" />
          All Systems Operational
        </span>
        <span className="inline-flex items-center gap-2">
          <LuClock3 className="h-[13px] w-[13px] text-[#536274]" aria-hidden="true" />
          {formatIstDate(now)}
          <span aria-hidden="true">&bull;</span>
          {formatIstTime(now)}
        </span>
        <span className="inline-flex items-center gap-2">
          All times are in IST
          <LuInfo className="h-[13px] w-[13px] text-[#536274]" aria-hidden="true" />
        </span>
      </footer>

      {showExpandedGraph ? (
        <GraphDialog data={dashboardData.dailyActiveUsers} onClose={() => setShowExpandedGraph(false)} />
      ) : null}
    </div>
  );
}

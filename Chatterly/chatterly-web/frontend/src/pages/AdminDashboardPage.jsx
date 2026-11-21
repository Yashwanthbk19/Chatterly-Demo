import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createLoadTest,
  getLoadTestResult,
  getPerformanceOverview,
  getProductionDashboard,
  optimizePerformance,
} from '../api/systemAdmin';
import CriticalBugTrackerPanel from '../components/CriticalBugTrackerPanel';
import ReleaseReadinessPanel from '../components/ReleaseReadinessPanel';
import MonitoringAnalyticsDashboard from './MonitoringAnalyticsDashboard';
import { logoutUser } from '../api/auth';

// Sprint 12 | Story 1 — Production Dashboard (Overview Screen).
// Central pre-launch monitoring screen. The five metrics are wired live to
// GET /api/system-admin/dashboard (docs/api.md §114); the screen polls while
// visible so the technical team sees current numbers without reloading.
//
// Story 2 performance monitoring is also rendered here because it shares this
// tabbed admin surface. Testing and the later quick-action panels remain clearly
// identified until their separate stories are implemented.

const POLL_INTERVAL_MS = 15000;
const PERFORMANCE_HISTORY_LIMIT = 20;

// Health bands per metric, aligned with Sprint 12's success criteria
// (response time < 200ms; low error rate). 'good' | 'warn' | 'bad' drive the
// accent colour only — the raw value is always shown verbatim.
const TONE = {
  good: { dot: '#10B981', text: '#047857', ring: '#10B981', soft: '#ECFDF5' },
  warn: { dot: '#F59E0B', text: '#B45309', ring: '#F59E0B', soft: '#FFFBEB' },
  bad: { dot: '#EF4444', text: '#B91C1C', ring: '#EF4444', soft: '#FEF2F2' },
  neutral: { dot: '#64748B', text: '#334155', ring: '#CBD5E1', soft: '#F8FAFC' },
};

const serverStatusTone = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'neutral';
  if (['healthy', 'ok', 'up', 'online', 'operational'].includes(normalized)) return 'good';
  if (['degraded', 'warning', 'warn', 'slow', 'partial'].includes(normalized)) return 'warn';
  return 'bad';
};

const responseTone = (ms) => {
  if (ms === null) return 'neutral';
  if (ms < 200) return 'good';
  if (ms < 500) return 'warn';
  return 'bad';
};

const errorRateTone = (rate) => {
  if (rate === null) return 'neutral';
  if (rate < 1) return 'good';
  if (rate < 5) return 'warn';
  return 'bad';
};

// Show numbers cleanly: integers stay whole, fractions keep up to two decimals
// with trailing zeros trimmed (6.7 not 6.70, 7 not 7.00).
const formatNumber = (value, { suffix = '', fallback = '—' } = {}) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
};

const formatServerStatus = (status) => (String(status || '').trim() || 'Unknown');

const formatBuildVersion = (version) => {
  const trimmed = String(version || '').trim();
  if (!trimmed) return '—';
  return /^v/i.test(trimmed) ? trimmed : `v${trimmed}`;
};

const ServerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </svg>
);
const PerformanceIcon = () => (
  <span className="inline-flex h-10 w-5 shrink-0 items-center justify-center" aria-hidden="true">
    <svg className="shrink-0" width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.636 27.3639C12.3773 26.1052 11.5202 24.5016 11.1729 22.7558C10.8257 21.0099 11.0039 19.2004 11.6851 17.5558C12.3663 15.9113 13.5198 14.5057 14.9999 13.5168C16.4799 12.5278 18.22 12 20 12C21.78 12 23.5201 12.5278 25.0001 13.5168C26.4802 14.5057 27.6337 15.9113 28.3149 17.5558C28.9961 19.2004 29.1743 21.0099 28.8271 22.7558C28.4798 24.5016 27.6227 26.1052 26.364 27.3639M24 16.9999L20 20.9999" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);
const AlertIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" />
  </svg>
);
const RocketIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M9 11a10 10 0 0 1 9-6c1 0 1 0 1 1a10 10 0 0 1-6 9l-4-4Z" /><circle cx="15" cy="9" r="1.3" />
  </svg>
);
const RefreshIcon = ({ spinning }) => (
  <svg className={spinning ? 'animate-spin' : ''} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
  </svg>
);

const performanceStatusTone = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['enabled', 'active', 'healthy', 'operational', 'online'].includes(normalized)) return 'good';
  if (['degraded', 'warning', 'partial', 'slow'].includes(normalized)) return 'warn';
  return normalized ? 'bad' : 'neutral';
};

const ResponseTimeGraph = ({ samples }) => {
  const data = samples.filter((sample) => Number.isFinite(sample.value));
  const responseTop = Math.max(400, Math.ceil(Math.max(1, ...data.map((sample) => sample.value)) / 100) * 100);
  const latencyTop = Math.max(50, Math.ceil(Math.max(1, ...data.map((sample) => sample.dbLatency || 0)) / 10) * 10);
  const width = 760;
  const height = 230;
  const pad = { left: 42, right: 42, top: 12, bottom: 30 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xAt = (index) => data.length <= 1 ? pad.left + plotWidth / 2 : pad.left + (index / (data.length - 1)) * plotWidth;
  const responseY = (value) => pad.top + plotHeight - (value / responseTop) * plotHeight;
  const latencyY = (value) => pad.top + plotHeight - (value / latencyTop) * plotHeight;
  const responsePoints = data.map((sample, index) => `${xAt(index)},${responseY(sample.value)}`).join(' ');
  const latencyPoints = data.map((sample, index) => `${xAt(index)},${latencyY(sample.dbLatency || 0)}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={`API response time and database latency history with ${data.length} samples`}>
      {[0, 1, 2, 3, 4].map((row) => {
        const y = pad.top + (row / 4) * plotHeight;
        return (
          <g key={row}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#EEF1F5" strokeWidth="1" />
            <text x={pad.left - 9} y={y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{Math.round(responseTop - (responseTop / 4) * row)}</text>
            <text x={width - pad.right + 9} y={y + 4} fontSize="10" fill="#94A3B8">{Math.round(latencyTop - (latencyTop / 4) * row)}ms</text>
          </g>
        );
      })}
      {data.length > 1 ? <polyline points={responsePoints} fill="none" stroke="#6D5EF6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {data.length > 1 ? <polyline points={latencyPoints} fill="none" stroke="#E5A24B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {data.length === 1 ? <><circle cx={xAt(0)} cy={responseY(data[0].value)} r="3" fill="#6D5EF6" /><circle cx={xAt(0)} cy={latencyY(data[0].dbLatency || 0)} r="3" fill="#E5A24B" /></> : null}
      {data.map((sample, index) => (index % labelStep === 0 || index === data.length - 1) ? <text key={sample.timestamp} x={xAt(index)} y={height - 8} textAnchor="middle" fontSize="10" fill="#94A3B8">{formatIstHourMinute(new Date(sample.timestamp))}</text> : null)}
      {data.length === 0 ? <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#94A3B8">Collecting live samples…</text> : null}
    </svg>
  );
};

const PerformanceTrend = ({ value, unit = 'ms' }) => value === null ? (
  <span className="text-[#94A3B8]">Live production metric</span>
) : (
  <span className={`inline-flex items-center gap-1 font-semibold ${value <= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
    <span className={value > 0 ? 'rotate-180' : ''}><ArrowDownIcon size={11} /></span>
    {formatNumber(Math.abs(value), { suffix: unit })} <span className="font-normal text-[#94A3B8]">vs first sample</span>
  </span>
);

const PerformanceOptimizationPanel = () => {
  const [performance, setPerformance] = useState(null);
  const [samples, setSamples] = useState([]);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [notice, setNotice] = useState('');
  const [showReport, setShowReport] = useState(false);
  const isMountedRef = useRef(true);

  const loadPerformance = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('loading');
    try {
      const result = await getPerformanceOverview();
      if (!isMountedRef.current) return;
      setPerformance(result.data);
      if (Number.isFinite(result.data.apiResponseTime)) {
        setSamples((current) => [...current, { value: result.data.apiResponseTime, dbLatency: result.data.dbLatency, timestamp: Date.now() }].slice(-PERFORMANCE_HISTORY_LIMIT));
      }
      setErrorMessage('');
      setStatus('ready');
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.message || 'Unable to load performance metrics.');
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadPerformance();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) loadPerformance({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [loadPerformance]);

  const handleOptimize = async () => {
    setIsOptimizing(true); setNotice(''); setErrorMessage('');
    try {
      const result = await optimizePerformance();
      if (!isMountedRef.current) return;
      setSamples([]);
      setNotice(result.message || 'System optimization completed successfully.');
      await loadPerformance({ silent: true });
    } catch (error) {
      if (isMountedRef.current) setErrorMessage(error?.message || 'System optimization failed.');
    } finally {
      if (isMountedRef.current) setIsOptimizing(false);
    }
  };

  if (status === 'loading') {
    return <div className="rounded-[14px] border border-[#E9EDF3] bg-white p-6"><div className="h-5 w-48 animate-pulse rounded bg-[#EEF2F7]" /><div className="mt-5 h-[190px] animate-pulse rounded-[12px] bg-[#F1F5F9]" /></div>;
  }

  if (status === 'error') {
    return <div className="rounded-[14px] border border-[#FEE2E2] bg-[#FEF2F2] p-6 text-center"><p className="text-[13px] font-semibold text-[#B91C1C]">Couldn&apos;t load performance metrics</p><p className="mt-1 text-[12px] text-[#7F1D1D]">{errorMessage}</p><button type="button" onClick={() => loadPerformance()} className="mt-4 rounded-full bg-[#DC2626] px-4 py-2 text-[12px] font-semibold text-white">Try again</button></div>;
  }

  const reportRows = [
    ['API response time', formatNumber(performance?.apiResponseTime, { suffix: 'ms' })],
    ['Slow queries', formatNumber(performance?.slowQueries)],
    ['Average DB latency', formatNumber(performance?.dbLatency, { suffix: 'ms' })],
    ['Media compression', performance?.mediaCompression || '—'],
    ['CDN status', performance?.cdnStatus || '—'],
  ];
  const firstSample = samples[0];
  const latestSample = samples[samples.length - 1];
  const responseDelta = firstSample && latestSample ? latestSample.value - firstSample.value : null;
  const latencyDelta = firstSample && latestSample && Number.isFinite(firstSample.dbLatency) && Number.isFinite(latestSample.dbLatency)
    ? latestSample.dbLatency - firstSample.dbLatency
    : null;

  return (
    <>
      <section aria-labelledby="performance-title">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 id="performance-title" className="text-[22px] font-bold leading-tight text-[#0F172A]">Performance Optimization</h1><p className="mt-1 text-[12px] text-[#64748B]">Monitor performance metrics and optimize system for better efficiency.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#E2E8F0] bg-white px-3 text-[11px] font-semibold text-[#334155]"><span className="h-2 w-2 rounded-full bg-[#16A34A]" />Production <span className="text-[#94A3B8]">⌄</span></span>
            <button type="button" onClick={() => setShowReport(true)} className="h-9 rounded-[8px] border border-[#E2E8F0] bg-white px-4 text-[11px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]">View Detailed Report</button>
            <button type="button" disabled={isOptimizing} onClick={handleOptimize} className="inline-flex h-10 w-[140px] items-center justify-center gap-2 rounded-[6px] bg-[var(--Brand-700,_#8B5CF6)] pb-2.5 pl-2 pr-3 pt-2.5 text-[11px] font-semibold text-white opacity-100 transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M10.8337 2.5V8.33333H15.8337L9.16699 17.5V11.6667H4.16699L10.8337 2.5Z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{isOptimizing ? 'Optimizing…' : 'Optimize Now'}</span>
            </button>
          </div>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px]">
          <div className="rounded-[12px] border border-[#ECEEF2] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[13px] font-bold text-[#0F172A]">API Response Time Graph</h2><span className="rounded-[7px] border border-[#E2E8F0] px-3 py-1.5 text-[10px] font-semibold text-[#475569]">Last 15 Minutes⌄</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-5 text-[10px] font-medium text-[#64748B]"><span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-[#6D5EF6]" />Response Time (ms)</span><span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-[#E5A24B]" />DB Latency (ms)</span></div>
            <div className="mt-2"><ResponseTimeGraph samples={samples} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-[10px] bg-[#F7F8FA] p-4"><p className="text-[10px] font-medium text-[#64748B]">Avg Response Time</p><p className="mt-3 text-[18px] font-bold text-[#0F172A]">{formatNumber(performance?.apiResponseTime, { suffix: 'ms' })}</p><p className="mt-2 text-[9px]"><PerformanceTrend value={responseDelta} /></p></div>
            <div className="rounded-[10px] bg-[#F7F8FA] p-4"><p className="text-[10px] font-medium text-[#64748B]">Avg DB Latency</p><p className="mt-3 text-[18px] font-bold text-[#0F172A]">{formatNumber(performance?.dbLatency, { suffix: 'ms' })}</p><p className="mt-2 text-[9px]"><PerformanceTrend value={latencyDelta} /></p></div>
            <div className="col-span-2 rounded-[10px] bg-[#F7F8FA] p-4 lg:col-span-1"><p className="text-[10px] font-medium text-[#64748B]">Slow Queries</p><p className="mt-3 text-[18px] font-bold text-[#0F172A]">{formatNumber(performance?.slowQueries)}</p><p className="mt-2 text-[9px] text-[#94A3B8]">Live production metric</p></div>
          </div>
        </div>

        <div className="mt-7 grid gap-6 md:grid-cols-2">
          <div><h2 className="flex items-center gap-2 text-[12px] font-bold text-[#0F172A]"><span className="text-[#64748B]"><ServerIcon /></span>Database Query Performance</h2><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-[10px] border border-[#ECEEF2] p-4"><p className="text-[10px] text-[#64748B]">Slow Queries</p><p className="mt-2 text-[18px] font-bold text-[#0F172A]">{formatNumber(performance?.slowQueries)}</p></div><div className="rounded-[10px] border border-[#ECEEF2] p-4"><p className="text-[10px] text-[#64748B]">Avg DB Latency</p><p className="mt-2 text-[18px] font-bold text-[#0F172A]">{formatNumber(performance?.dbLatency, { suffix: 'ms' })}</p></div></div></div>
          <div><h2 className="flex items-center gap-2 text-[12px] font-bold text-[#0F172A]"><span className="text-[#64748B]"><BoxIcon /></span>Media &amp; CDN Optimization</h2><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-[10px] border border-[#ECEEF2] p-4"><p className="text-[10px] text-[#64748B]">Media Compression Status</p><p className="mt-3 text-[13px] font-bold" style={{ color: TONE[performanceStatusTone(performance?.mediaCompression)].text }}>{performance?.mediaCompression || '—'}</p></div><div className="rounded-[10px] border border-[#ECEEF2] p-4"><p className="text-[10px] text-[#64748B]">CDN Status</p><p className="mt-3 text-[13px] font-bold" style={{ color: TONE[performanceStatusTone(performance?.cdnStatus)].text }}>{performance?.cdnStatus || '—'}</p></div></div></div>
        </div>

        {errorMessage ? <p role="alert" className="mt-4 rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[11px] font-medium text-[#B91C1C]">Latest refresh failed: {errorMessage}</p> : null}
        {notice ? <p role="status" className="mt-4 rounded-[8px] bg-[#ECFDF5] px-3 py-2 text-[11px] font-medium text-[#047857]">{notice}</p> : null}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEEF2] pt-4 text-[10px] text-[#94A3B8]"><span>Last Updated: {latestSample ? formatIstClock(new Date(latestSample.timestamp)) : '—'} <span className="px-2">•</span> Auto Refreshes every {POLL_INTERVAL_MS / 1000}s</span><span className="inline-flex items-center gap-5"><span className="inline-flex items-center gap-2 text-[#16A34A]"><span className="h-2 w-2 rounded-full bg-[#16A34A]" />All Systems Operational</span><span>All times are in IST</span></span></footer>
      </section>

      {showReport ? <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 px-4" role="dialog" aria-modal="true" aria-labelledby="performance-report-title" onMouseDown={(event) => event.target === event.currentTarget && setShowReport(false)}><div className="w-full max-w-[480px] rounded-[18px] bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h3 id="performance-report-title" className="text-[16px] font-bold text-[#0F172A]">Detailed Performance Report</h3><p className="mt-1 text-[11px] text-[#64748B]">Current production metrics and live sampling summary.</p></div><button type="button" onClick={() => setShowReport(false)} aria-label="Close detailed report" className="h-8 w-8 rounded-full text-[#64748B] hover:bg-[#F1F5F9]">×</button></div><dl className="mt-5 divide-y divide-[#E9EDF3]">{reportRows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-3 text-[12px]"><dt className="text-[#64748B]">{label}</dt><dd className="font-semibold text-[#0F172A]">{value}</dd></div>)}</dl><p className="mt-4 rounded-[8px] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#64748B]">Response graph contains {samples.length} live {samples.length === 1 ? 'sample' : 'samples'} from this dashboard session.</p></div></div> : null}
    </>
  );
};

const LoadStressTestingPanel = () => {
  const [concurrentUsers, setConcurrentUsers] = useState('50000');
  const [testDuration, setTestDuration] = useState('30');
  const [results, setResults] = useState({
    requestedUsers: 50000, duration: 30, maxUsersHandled: 47000, crashEvents: 12430, avgCpuUsage: 72, memoryUsage: 'Stable', status: 'completed',
  });
  const [isRunning, setIsRunning] = useState(false);
  const [loadTestError, setLoadTestError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [testHistory, setTestHistory] = useState([]);

  const handleStartTest = async () => {
    const users = Math.max(1, Number.parseInt(concurrentUsers, 10) || 1);
    const durationMinutes = Number.parseInt(testDuration, 10) || 30;
    setIsRunning(true);
    setLoadTestError('');

    try {
      const created = await createLoadTest({ requestedUsers: users, duration: durationMinutes });
      const persisted = created.data?._id
        ? await getLoadTestResult(created.data._id)
        : created;
      const nextResult = persisted.data;
      setResults(nextResult);
      setTestHistory((history) => [{ ...nextResult, id: nextResult._id || `LT-${String(history.length + 1001).padStart(4, '0')}`, startedAt: new Date() }, ...history].slice(0, 5));
    } catch (error) {
      setLoadTestError(error?.message || 'Unable to run the load test.');
    } finally {
      setIsRunning(false);
    }
  };

  const resultCards = results ? [
    {
      label: 'Max Users Handled',
      value: Number.isFinite(results.maxUsersHandled) ? results.maxUsersHandled.toLocaleString() : '—',
      tone: results.maxUsersHandled >= results.requestedUsers ? 'good' : 'warn',
    },
    {
      label: 'Crash Events',
      value: Number.isFinite(results.crashEvents) ? results.crashEvents.toLocaleString() : '—',
      tone: results.crashEvents === 0 ? 'good' : 'bad',
    },
    {
      label: 'Avg. CPU Usage',
      value: Number.isFinite(results.avgCpuUsage) ? `${results.avgCpuUsage}%` : '—',
      tone: results.avgCpuUsage < 70 ? 'good' : results.avgCpuUsage < 90 ? 'warn' : 'bad',
    },
    {
      label: 'Memory Usage',
      value: results.memoryUsage || '—',
      tone: 'neutral',
    },
  ] : [];

  const displayedHistory = testHistory.length ? testHistory : Array.from({ length: 3 }, (_, index) => ({ ...results, id: `LT-${1001 + index}`, startedAt: new Date(2026, 4, 26, 10, 10) }));
  const numberWithComma = (value) => Number(value || 0).toLocaleString();

  return (
    <section aria-labelledby="load-testing-title" className="mx-auto max-w-[1120px] pb-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 id="load-testing-title" className="text-[21px] font-bold tracking-tight text-[#101828]">Load &amp; Stress Testing</h1><p className="mt-1 text-[11px] text-[#667085]">Simulate heavy traffic and validate system stability under load.</p></div>
        <div className="flex items-center gap-3"><button type="button" className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[#EAECF0] bg-white px-3 text-[11px] font-medium text-[#344054]"><span className="h-2 w-2 rounded-full bg-[#12B76A]" />Production <span className="text-[#98A2B3]">⌄</span></button><button type="button" className="h-9 rounded-[7px] border border-[#EAECF0] bg-white px-3 text-[11px] font-medium text-[#344054]">Last 15 Minutes ⌄</button></div>
      </header>

      <div className="mt-7 rounded-[14px] border border-[#EAECF0] bg-white p-5 sm:p-6">
        <h2 className="text-[13px] font-bold text-[#101828]">Concurrent Users Test</h2><p className="mt-1 text-[10px] text-[#667085]">Configure the test parameters and run a load test.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_160px] lg:items-end">
          <label className="block text-[11px] font-medium text-[#344054]">Concurrent User<input type="number" min="1" value={concurrentUsers} onChange={(event) => setConcurrentUsers(event.target.value)} className="mt-2 h-10 w-full rounded-[7px] border border-[#EAECF0] px-3 text-[12px] font-medium text-[#101828] outline-none focus:border-[#8B5CF6]" /><span className="mt-1.5 block text-[9px] font-normal text-[#667085]">Enter the number of concurrent users to simulate</span></label>
          <label className="block text-[11px] font-medium text-[#344054]">Duration<div className="mt-2 flex h-10 overflow-hidden rounded-[7px] border border-[#EAECF0]"><input type="number" min="1" value={testDuration} onChange={(event) => setTestDuration(event.target.value)} className="min-w-0 flex-1 px-3 text-[12px] font-medium outline-none" /><span className="flex items-center border-l border-[#EAECF0] px-3 text-[11px] font-medium">mins ⌄</span></div><span className="mt-1.5 block text-[9px] font-normal text-[#667085]">Select the duration for the test.</span></label>
          <button type="button" onClick={handleStartTest} disabled={isRunning} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[6px] bg-[#8B5CF6] px-5 text-[11px] font-semibold text-white shadow-[0_4px_8px_rgba(139,92,246,.22)] transition hover:bg-[#7C3AED] disabled:opacity-60">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 3.83354V17.1665C3.99996 17.3147 4.04106 17.4603 4.11906 17.5882C4.19706 17.7161 4.30915 17.8217 4.44374 17.8941C4.57834 17.9664 4.73057 18.0029 4.88474 17.9998C5.03891 17.9967 5.18942 17.9541 5.32076 17.8764L16.5871 11.21C16.7133 11.1354 16.8175 11.031 16.8898 10.9067C16.962 10.7824 17 10.6424 17 10.5C17 10.3576 16.962 10.2176 16.8898 10.0933C16.8175 9.96898 16.7133 9.86458 16.5871 9.79002L5.32076 3.12356C5.18942 3.04587 5.03891 3.00328 4.88474 3.00018C4.73057 2.99709 4.57834 3.0336 4.44374 3.10595C4.30915 3.1783 4.19706 3.28387 4.11906 3.41177C4.04106 3.53968 3.99996 3.68527 4 3.83354Z" fill="white" />
            </svg>
            <span>{isRunning ? 'Starting...' : 'Start Test'}</span>
          </button>
        </div>
      </div>
      <p className="mt-3 inline-flex items-center gap-3 rounded-[3px] bg-[#F1EAFE] px-4 py-2 text-[10px] font-medium text-[#6938EF]"><span className="text-[14px]">♧</span>This test will simulate {numberWithComma(concurrentUsers)} concurrent users for {testDuration || 0} minutes.</p>
      {loadTestError ? <p role="alert" className="mt-3 rounded-[7px] bg-[#FEF3F2] px-3 py-2 text-[11px] text-[#B42318]">{loadTestError}</p> : null}

      <div className="mt-6 rounded-[14px] border border-[#EAECF0] bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-[13px] font-bold text-[#101828]">Test Results</h2><button type="button" onClick={() => setShowReport((open) => !open)} className="h-9 rounded-[6px] border border-[#EAECF0] px-3 text-[10px] font-medium text-[#344054]">View Detailed Report ↗</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{resultCards.map((card, index) => <div key={card.label} className="overflow-hidden rounded-[9px] border border-[#EAECF0]"><div className="flex items-center gap-1.5 bg-[#F9FAFB] px-3 py-2 text-[10px] font-medium text-[#475467]"><span>{['♧', '⬡', '▣', '▥'][index]}</span>{card.label}</div><p className="px-3 py-3 text-[16px] font-bold text-[#101828]">{card.value}</p></div>)}</div>{showReport ? <div className="mt-4 rounded-[8px] border border-[#E9D7FE] bg-[#FCFAFF] p-3 text-[11px] text-[#475467]">Requested users: <b>{numberWithComma(results.requestedUsers)}</b> · Duration: <b>{results.duration} minutes</b> · Status: <b className="text-[#027A48]">{results.status || 'Completed'}</b></div> : null}</div>

      <div className="mt-6 rounded-[14px] border border-[#EAECF0] bg-white p-5 sm:p-6"><h2 className="text-[13px] font-bold text-[#101828]">Recent Test Results</h2><div className="mt-5 overflow-x-auto rounded-[8px] border border-[#EAECF0]"><table className="w-full min-w-[780px] text-left text-[9px]"><thead className="bg-[#F9FAFB] text-[#475467]"><tr>{['Test ID', 'Conc. Users', 'Duration', 'Max Users Handled', 'Avg. CPU', 'Memory Usage', 'Crash Events', 'Status', 'Started At'].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-2.5 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#EAECF0] text-[#101828]">{displayedHistory.map((test, index) => <tr key={`${test.id}-${index}`}><td className="px-3 py-2.5">{test.id}</td><td className="px-3 py-2.5">{numberWithComma(test.requestedUsers)}</td><td className="px-3 py-2.5">{test.duration} mins</td><td className="px-3 py-2.5">{numberWithComma(test.maxUsersHandled)}</td><td className="px-3 py-2.5">{test.avgCpuUsage}%</td><td className="px-3 py-2.5">{test.memoryUsage || 'Stable'}</td><td className="px-3 py-2.5">{numberWithComma(test.crashEvents)}</td><td className="px-3 py-2.5"><span className="rounded bg-[#ECFDF3] px-1.5 py-1 text-[#027A48]">Completed</span></td><td className="whitespace-nowrap px-3 py-2.5">{test.startedAt ? formatIstDate(new Date(test.startedAt)).replace(',', '') : 'May 26, 2026'}, 10:10AM</td></tr>)}</tbody></table></div></div>
      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[10px] text-[#667085]"><span>Last Updated: 10:09:30 AM • Auto Refreshes every 15 mins ⟳</span><span className="inline-flex items-center gap-4"><span className="inline-flex items-center gap-2 text-[#475467]"><span className="h-2 w-2 rounded-full bg-[#12B76A]" />All Systems Operational</span><span>All times are in IST ⓘ</span></span></footer>
    </section>
  );
};

// ── Sprint 12 refresh — sidebar shell + Production Overview ──────────────────
// The admin surface is now a left-nav layout. "Dashboard" is the Production
// Overview (live health cards + a dual-axis performance chart built from the
// poll history); the other nav items mount the existing Story 2-6 panels.

const IST_TIME_ZONE = 'Asia/Kolkata';
const CHART_HISTORY_LIMIT = 260; // ~1h of samples at the 15s poll cadence

const formatIstDate = (date) =>
  date.toLocaleDateString('en-US', { timeZone: IST_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const formatIstTime = (date) =>
  date.toLocaleTimeString('en-US', { timeZone: IST_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
const formatIstClock = (date) =>
  date.toLocaleTimeString('en-US', { timeZone: IST_TIME_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
const formatIstHourMinute = (date) =>
  date.toLocaleTimeString('en-GB', { timeZone: IST_TIME_ZONE, hour: '2-digit', minute: '2-digit' });

const readStoredAdmin = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('user') || 'null') || {};
    return {
      name: String(stored.name || stored.fullName || 'Admin').trim() || 'Admin',
      avatar: String(stored.profilePic || stored.profilePicture || stored.avatar || '').trim(),
    };
  } catch {
    return { name: 'Admin', avatar: '' };
  }
};

// Icons ----------------------------------------------------------------------
const iconBase = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
};
const ChatLogoIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.9" aria-hidden="true">
    <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.1A7.5 7.5 0 1 1 20.5 11.5Z" />
    <circle cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const GridIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" />
    <rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" />
  </svg>
);
const TestingIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4v-.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
    <path d="M9.3 12.2l1.7 1.7 3.4-3.6" />
  </svg>
);
const BugIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <rect x="8" y="7" width="8" height="12" rx="4" />
    <path d="M8 11H4M8 15H4M16 11h4M16 15h4M9.5 7 8 4.5M14.5 7 16 4.5M12 19v2" />
  </svg>
);
const AnalyticsIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <path d="M4 4v16h16" /><path d="M7.5 14.5l3-3 2.5 2 4-5" />
  </svg>
);
const BoxIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <path d="M12 2 3.5 7v10L12 22l8.5-5V7Z" /><path d="M3.5 7 12 12l8.5-5M12 12v10" />
  </svg>
);
const SettingsIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" />
  </svg>
);
const LogoutIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
    <path d="M18 15l3-3-3-3M21 12H9" />
  </svg>
);
const ClockIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
  </svg>
);
const InfoIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" />
  </svg>
);
const ChevronRightIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const ArrowUpIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V6M6 12l6-6 6 6" />
  </svg>
);
const ArrowDownIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v13M6 12l6 6 6-6" />
  </svg>
);
const MetricDelta = ({ delta, fallback, deltaNote }) => {
  if (!delta) return <p className="mt-2 text-[12px] text-[#94A3B8]">{fallback}</p>;
  const cls = delta.good === true ? 'text-[#16A34A]' : delta.good === false ? 'text-[#DC2626]' : 'text-[#64748B]';
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[12px]">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${cls}`}>
        {delta.dir === 'up' ? <ArrowUpIcon /> : <ArrowDownIcon />}{delta.text}
      </span>
      <span className="text-[#94A3B8]">{deltaNote}</span>
    </p>
  );
};
const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </svg>
);
const BarChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <path d="M3.5 20.5h17" /><path d="M7 20.5v-7M12 20.5V6M17 20.5v-4.5" />
  </svg>
);
const DocIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...iconBase} aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" />
  </svg>
);
const LoadTestIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12h4l2.5-6.5L14 18l2-6h5" />
  </svg>
);

// Live performance chart -----------------------------------------------------
const niceTop = (value, step, min) => Math.max(min, Math.ceil(value / step) * step);

const SystemPerformanceChart = ({ samples, windowMinutes, now }) => {
  const cutoff = now.getTime() - windowMinutes * 60000;
  let data = samples.filter((s) => s.t >= cutoff && Number.isFinite(s.responseTime));
  if (data.length === 0) data = samples.filter((s) => Number.isFinite(s.responseTime));

  const W = 760, H = 300, padL = 40, padR = 48, padT = 16, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  const rtTop = niceTop(Math.max(1, ...data.map((d) => d.responseTime)), 100, 400);
  const erTop = niceTop(Math.max(0.01, ...data.map((d) => (Number.isFinite(d.errorRate) ? d.errorRate : 0))), 0.5, 2);

  const n = data.length;
  const xAt = (i) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const yRt = (v) => baseY - (Math.min(v, rtTop) / rtTop) * plotH;
  const yEr = (v) => baseY - (Math.min(v, erTop) / erTop) * plotH;

  const rtPts = data.map((d, i) => [xAt(i), yRt(d.responseTime)]);
  const erPts = data.map((d, i) => [xAt(i), yEr(Number.isFinite(d.errorRate) ? d.errorRate : 0)]);

  const toLine = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const toArea = (pts) =>
    pts.length
      ? `M${pts[0][0].toFixed(1)},${baseY} ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${pts[pts.length - 1][0].toFixed(1)},${baseY} Z`
      : '';

  const rows = [0, 1, 2, 3, 4];
  const labelCount = Math.min(n, 8);
  const xLabels = [];
  for (let k = 0; k < labelCount; k += 1) {
    const idx = labelCount <= 1 ? 0 : Math.round((k * (n - 1)) / (labelCount - 1));
    xLabels.push({ x: xAt(idx), label: formatIstHourMinute(new Date(data[idx].t)) });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="System performance over time">
      {rows.map((k) => {
        const y = baseY - (k / 4) * plotH;
        return (
          <g key={k}>
            <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="#EEF1F5" strokeWidth="1" />
            <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="#94A3B8">{Math.round((rtTop / 4) * k)}</text>
            <text x={padL + plotW + 8} y={y + 3.5} textAnchor="start" fontSize="10" fill="#94A3B8">{((erTop / 4) * k).toFixed(1)}%</text>
          </g>
        );
      })}
      {n > 0 ? <path d={toArea(rtPts)} fill="#6D5EF6" fillOpacity="0.10" /> : null}
      {n > 0 ? <path d={toArea(erPts)} fill="#E8873B" fillOpacity="0.12" /> : null}
      {n > 1 ? <path d={toLine(rtPts)} fill="none" stroke="#6D5EF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {n > 1 ? <path d={toLine(erPts)} fill="none" stroke="#E8873B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {n === 1 ? (
        <>
          <circle cx={rtPts[0][0]} cy={rtPts[0][1]} r="3.6" fill="#6D5EF6" />
          <circle cx={erPts[0][0]} cy={erPts[0][1]} r="3.6" fill="#E8873B" />
        </>
      ) : null}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 12} textAnchor="middle" fontSize="10" fill="#94A3B8">{l.label}</text>
      ))}
      {n === 0 ? <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="#94A3B8">Collecting live samples…</text> : null}
    </svg>
  );
};

// Metric tile ----------------------------------------------------------------
const MetricTile = ({ icon, label, highlight = false, children }) => (
  <div className={`rounded-[16px] border p-4 ${highlight ? 'border-[#F3E2AF] bg-[#FEFBEC]' : 'border-[#ECEEF2] bg-[#F7F8FA]'}`}>
    <div className="flex items-center gap-2">
      <span className={`inline-flex [&>svg]:h-[17px] [&>svg]:w-[17px] ${highlight ? 'text-[#D97706]' : 'text-[#64748B]'}`}>{icon}</span>
      <span className="text-[13px] font-semibold text-[#64748B]">{label}</span>
    </div>
    <div className="mt-3">{children}</div>
  </div>
);

// Dashboard (Production Overview) --------------------------------------------
const QUICK_ACTIONS = [
  { id: 'logs', label: 'View Logs', desc: 'Inspect system and error logs', icon: <DocIcon /> },
  { id: 'loadtest', label: 'Run Load Test', desc: 'Test system under load', icon: <LoadTestIcon /> },
  { id: 'release', label: 'Release Panel', desc: 'Manage deployments', icon: <RocketIcon /> },
];

const DashboardOverview = ({
  dashboard, status, errorMessage, samples, now,
  lastUpdatedAt, isRefreshing, onRefresh, onRetry, onQuickAction,
}) => {
  const [windowKey, setWindowKey] = useState('15');
  const windowMinutes = Number(windowKey);
  const deltaNote = `vs last ${windowMinutes} min`;

  const overallTone = useMemo(() => {
    if (status !== 'ready') return 'neutral';
    const tones = [serverStatusTone(dashboard?.serverStatus), responseTone(dashboard?.avgResponseTime), errorRateTone(dashboard?.errorRate)];
    if (tones.includes('bad')) return 'bad';
    if (tones.includes('warn')) return 'warn';
    return 'good';
  }, [dashboard, status]);

  const statusMeta = {
    good: { label: 'All Systems Operational', color: '#16A34A' },
    warn: { label: 'Degraded Performance', color: '#B45309' },
    bad: { label: 'Action Required', color: '#DC2626' },
    neutral: { label: 'Awaiting Data', color: '#64748B' },
  }[overallTone];

  const serverTone = serverStatusTone(dashboard?.serverStatus);
  const serverColor = { good: '#16A34A', warn: '#B45309', bad: '#DC2626', neutral: '#334155' }[serverTone];
  const serverSubtitle = { good: 'All systems operational', warn: 'Degraded performance', bad: 'Action required', neutral: 'Awaiting data' }[serverTone];

  const deltas = useMemo(() => {
    const cutoff = now.getTime() - windowMinutes * 60000;
    const win = samples.filter((s) => s.t >= cutoff);
    const baseline = win.length >= 2 ? win[0] : null;
    const latest = samples[samples.length - 1] || null;
    if (!baseline || !latest) return {};
    const build = (diff, good) => ({ dir: diff >= 0 ? 'up' : 'down', good: diff === 0 ? null : good });
    const out = {};
    if (Number.isFinite(baseline.activeUsers) && baseline.activeUsers > 0 && Number.isFinite(latest.activeUsers)) {
      const pct = ((latest.activeUsers - baseline.activeUsers) / baseline.activeUsers) * 100;
      out.activeUsers = { ...build(pct, pct >= 0), text: `${Math.abs(pct).toFixed(1)}%` };
    }
    if (Number.isFinite(baseline.responseTime) && Number.isFinite(latest.responseTime)) {
      const diff = latest.responseTime - baseline.responseTime;
      out.responseTime = { ...build(diff, diff <= 0), text: `${Math.abs(Math.round(diff))}ms` };
    }
    if (Number.isFinite(baseline.errorRate) && Number.isFinite(latest.errorRate)) {
      const diff = latest.errorRate - baseline.errorRate;
      out.errorRate = { ...build(diff, diff <= 0), text: `${Math.abs(diff).toFixed(1)}%` };
    }
    return out;
  }, [samples, now, windowMinutes]);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold leading-tight text-[#0F172A]">Production Overview</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">Real-time overview of production system health and readiness</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: statusMeta.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusMeta.color }} aria-hidden="true" />
            {statusMeta.label}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[#64748B]">
            <ClockIcon /> {formatIstDate(now)} • {formatIstTime(now)}
          </span>
        </div>
      </header>

      {status === 'loading' ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[116px] animate-pulse rounded-[16px] bg-[#F1F3F6]" />)}
        </div>
      ) : status === 'error' ? (
        <div className="mt-6 rounded-[16px] border border-[#FEE2E2] bg-[#FEF2F2] p-6 text-center">
          <p className="text-[14px] font-semibold text-[#B91C1C]">Couldn&apos;t load the dashboard</p>
          <p className="mx-auto mt-1 max-w-[420px] text-[12px] text-[#7F1D1D]">{errorMessage}</p>
          <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#DC2626] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#B91C1C]">
            <RefreshIcon /> Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <MetricTile icon={<ServerIcon />} label="Server Status">
              <p className="text-[26px] font-bold leading-tight" style={{ color: serverColor }}>{formatServerStatus(dashboard?.serverStatus)}</p>
              <p className="mt-2 text-[12px] text-[#94A3B8]">{serverSubtitle}</p>
            </MetricTile>
            <MetricTile icon={<UserIcon />} label="Active Users">
              <p className="text-[26px] font-bold leading-tight text-[#0F172A]">{formatNumber(dashboard?.activeUsers)}</p>
              <MetricDelta delta={deltas.activeUsers} fallback="Live metric" deltaNote={deltaNote} />
            </MetricTile>
            <MetricTile icon={<RocketIcon />} label="Build Version">
              <p className="text-[26px] font-bold leading-tight text-[#0F172A]">{formatBuildVersion(dashboard?.buildVersion)}</p>
              <p className="mt-2 text-[12px] text-[#94A3B8]">Production build</p>
            </MetricTile>
            <MetricTile icon={<BarChartIcon />} label="Avg Response Time">
              <p className="text-[26px] font-bold leading-tight text-[#0F172A]">{formatNumber(dashboard?.avgResponseTime, { suffix: 'ms' })}</p>
              <MetricDelta delta={deltas.responseTime} fallback="Live metric" deltaNote={deltaNote} />
            </MetricTile>
            <MetricTile icon={<AlertIcon />} label="Error Rate" highlight>
              <p className="text-[26px] font-bold leading-tight text-[#0F172A]">{formatNumber(dashboard?.errorRate, { suffix: '%' })}</p>
              <MetricDelta delta={deltas.errorRate} fallback="Live metric" deltaNote={deltaNote} />
            </MetricTile>
          </div>

          {errorMessage ? (
            <p className="mt-3 text-[11px] font-medium text-[#B45309]">Showing last known values — latest refresh failed: {errorMessage}</p>
          ) : null}

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <section className="rounded-[16px] border border-[#ECEEF2] bg-white p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[16px] font-bold text-[#0F172A]">System Performance</h2>
                <select
                  value={windowKey}
                  onChange={(event) => setWindowKey(event.target.value)}
                  className="rounded-[10px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#334155] outline-none transition-colors hover:border-[#CBD5E1] focus:border-[#94A3B8]"
                  aria-label="Performance time range"
                >
                  <option value="15">Last 15 Minutes</option>
                  <option value="30">Last 30 Minutes</option>
                  <option value="60">Last Hour</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-5 text-[12px] font-medium text-[#64748B]">
                <span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-[#6D5EF6]" aria-hidden="true" />Response Time (ms)</span>
                <span className="inline-flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-[#E8873B]" aria-hidden="true" />Error Rate (%)</span>
              </div>
              <div className="mt-2">
                <SystemPerformanceChart samples={samples} windowMinutes={windowMinutes} now={now} />
              </div>
            </section>

            <section className="rounded-[16px] border border-[#ECEEF2] bg-white p-5">
              <h2 className="text-[16px] font-bold text-[#0F172A]">Quick Actions</h2>
              <div className="mt-4 space-y-3">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onQuickAction(action.id)}
                    className="flex w-full items-center gap-3 rounded-[12px] border border-[#ECEEF2] bg-white px-4 py-3 text-left transition-colors hover:border-[#D8DCE3] hover:bg-[#F9FAFB]"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#F1EFFE] text-[#6D5EF6]">{action.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-[#0F172A]">{action.label}</span>
                      <span className="block truncate text-[12px] text-[#94A3B8]">{action.desc}</span>
                    </span>
                    <span className="text-[#CBD5E1]"><ChevronRightIcon /></span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEEF2] pt-4 text-[12px] text-[#94A3B8]">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span>Last Updated: {lastUpdatedAt ? formatIstClock(new Date(lastUpdatedAt)) : '—'}</span>
              <span aria-hidden="true">•</span>
              <span>Auto Refreshes every {POLL_INTERVAL_MS / 1000}s</span>
              <button type="button" onClick={onRefresh} aria-label="Refresh now" className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]">
                <RefreshIcon spinning={isRefreshing} />
              </button>
            </span>
            <span className="inline-flex items-center gap-1.5">All times are in IST <InfoIcon /></span>
          </footer>
        </>
      )}
    </>
  );
};

// Sidebar --------------------------------------------------------------------
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: GridIcon },
  { id: 'performance', label: 'Performance', Icon: PerformanceIcon },
  { id: 'testing', label: 'Testing', Icon: TestingIcon },
  { id: 'bugs', label: 'Bugs', Icon: BugIcon },
  { id: 'analytics', label: 'Analytics', Icon: AnalyticsIcon },
  { id: 'release', label: 'Release', Icon: BoxIcon },
];

const AdminSidebar = ({ activeView, onSelect, onLogout }) => {
  const admin = readStoredAdmin();
  const initial = admin.name.charAt(0).toUpperCase() || 'A';
  return (
    <aside className="flex w-[72px] shrink-0 flex-col border-r border-[#E7EBF2] bg-white sm:w-[224px]">
      <div className="flex items-center justify-center gap-2 px-3 pb-[46px] pt-[34px] sm:justify-start sm:px-6">
        <span className="inline-flex items-center text-[#0F172A]"><ChatLogoIcon /></span>
        <span className="hidden leading-tight sm:inline">
          <span className="block text-[19px] font-extrabold tracking-tight text-[#0F172A]">Chatterly</span>
          <span className="block text-[11px] font-semibold leading-none text-[#6D5EF6]">Admin</span>
        </span>
      </div>
      <nav className="flex-1 space-y-[11px]">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-[48px] w-full items-center justify-center gap-3 border-l-[3px] px-3 font-medium transition-colors sm:justify-start sm:px-[28px] ${id === 'performance' ? 'font-sans text-sm leading-5 tracking-normal not-italic' : 'text-[12px]'} ${active ? 'border-[#8B5CF6] bg-[#F0EAFE] text-[#6D28D9]' : 'border-transparent text-[#536A86] hover:bg-[#F8FAFC]'}`}
            >
              {React.createElement(Icon, { size: 17 })}
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center justify-center gap-2 px-3 pb-[31px] sm:justify-start sm:px-6">
        {admin.avatar ? (
          <img src={admin.avatar} alt="" className="h-[28px] w-[28px] rounded-[3px] object-cover" />
        ) : (
          <span className="flex h-[28px] w-[28px] items-center justify-center rounded-[3px] bg-[#F1EFFE] text-[12px] font-bold text-[#6D5EF6]">{initial}</span>
        )}
        <span className="hidden flex-1 truncate text-[12px] font-semibold text-[#0F172A] sm:inline">{admin.name}</span>
        <button type="button" onClick={onLogout} aria-label="Log out" className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-[#EF4444] transition-colors hover:bg-[#FEF2F2]">
          <LogoutIcon size={15} />
        </button>
      </div>
    </aside>
  );
};

const SettingsPlaceholder = () => (
  <div className="rounded-[16px] border border-[#ECEEF2] bg-white p-8 text-center">
    <h2 className="text-[16px] font-bold text-[#0F172A]">Admin Settings</h2>
    <p className="mx-auto mt-2 max-w-[400px] text-[13px] text-[#64748B]">Dashboard preferences and account settings are managed from the main Chatterly app.</p>
  </div>
);

const INITIAL_TAB_TO_VIEW = {
  monitoring: 'analytics',
  analytics: 'analytics',
  health: 'dashboard',
  dashboard: 'dashboard',
  performance: 'performance',
  testing: 'testing',
  bugs: 'bugs',
  release: 'release',
  settings: 'settings',
};

export default function AdminDashboardPage({ initialTab = 'dashboard' }) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [samples, setSamples] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [activeView, setActiveView] = useState(INITIAL_TAB_TO_VIEW[initialTab] || 'dashboard');
  const [notice, setNotice] = useState('');

  const isMountedRef = useRef(true);
  const noticeTimeoutRef = useRef(null);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setStatus('loading');

    try {
      const result = await getProductionDashboard();
      if (!isMountedRef.current) return;
      setDashboard(result.data);
      setLastUpdatedAt(Date.now());
      setSamples((current) => [
        ...current,
        {
          t: Date.now(),
          responseTime: result.data.avgResponseTime,
          errorRate: result.data.errorRate,
          activeUsers: result.data.activeUsers,
        },
      ].slice(-CHART_HISTORY_LIMIT));
      setErrorMessage('');
      setStatus('ready');
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.message || 'Unable to load the production dashboard.');
      // A failed silent refresh keeps the last good numbers on screen; only a
      // failed initial load takes over the whole panel.
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadDashboard();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadDashboard]);

  // Poll while the tab is visible; pause in the background so a hidden dashboard
  // isn't hammering the server, and refresh immediately on becoming visible.
  useEffect(() => {
    let intervalId = null;
    const startPolling = () => {
      if (intervalId) return;
      intervalId = window.setInterval(() => loadDashboard({ silent: true }), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        loadDashboard({ silent: true });
        startPolling();
      }
    };
    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadDashboard]);

  // Tick the header clock without refetching.
  useEffect(() => {
    const tickerId = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(tickerId);
  }, []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
  }, []);

  const showNotice = useCallback((message) => {
    setNotice(message);
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current) setNotice('');
    }, 4000);
  }, []);

  const handleQuickAction = useCallback((id) => {
    if (id === 'loadtest') setActiveView('testing');
    else if (id === 'release') setActiveView('release');
    else showNotice('A logs viewer is not part of this build yet — there is no logs endpoint in the API.');
  }, [showNotice]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Local sign-out still proceeds; route to login regardless of backend result.
    } finally {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-white text-[#0F172A]">
      <AdminSidebar activeView={activeView} onSelect={setActiveView} onLogout={handleLogout} />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className={`mx-auto w-full ${activeView === 'bugs' ? 'max-w-none px-5 py-6' : activeView === 'analytics' || activeView === 'release' ? 'max-w-none px-[28px] py-[31px]' : 'max-w-[1280px] px-5 py-6 md:px-8 md:py-8'}`}>
          {notice ? (
            <div className="mb-4 rounded-[10px] border border-[#E9EDF3] bg-white px-4 py-2.5 text-[12px] font-medium text-[#475569] shadow-sm" role="status">
              {notice}
            </div>
          ) : null}

          {activeView === 'dashboard' ? (
            <DashboardOverview
              dashboard={dashboard}
              status={status}
              errorMessage={errorMessage}
              samples={samples}
              now={now}
              lastUpdatedAt={lastUpdatedAt}
              isRefreshing={isRefreshing}
              onRefresh={() => loadDashboard({ silent: true })}
              onRetry={() => loadDashboard()}
              onQuickAction={handleQuickAction}
            />
          ) : activeView === 'performance' ? (
            <PerformanceOptimizationPanel />
          ) : activeView === 'testing' ? (
            <LoadStressTestingPanel />
          ) : activeView === 'bugs' ? (
            <CriticalBugTrackerPanel />
          ) : activeView === 'analytics' ? (
            <MonitoringAnalyticsDashboard onExportSuccess={showNotice} />
          ) : activeView === 'release' ? (
            <ReleaseReadinessPanel />
          ) : (
            <SettingsPlaceholder />
          )}
        </div>
      </main>
    </div>
  );
}

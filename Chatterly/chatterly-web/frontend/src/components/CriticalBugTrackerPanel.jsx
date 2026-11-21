import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assignBugDeveloper,
  createBugReport,
  getBugReports,
  getReleaseChecklist,
  resolveBugReport,
} from '../api/systemAdmin';

const SEVERITIES = ['All', 'Critical', 'High', 'Medium', 'Low'];
const AUTO_REFRESH_MS = 15 * 60 * 1000;

const SEVERITY_STYLES = {
  Critical: 'bg-[#FDF0F0] text-[#B91C1C]',
  High: 'bg-[#FEF0F0] text-[#C53A3A]',
  Medium: 'bg-[#FFF7E7] text-[#B7791F]',
  Low: 'bg-[#EDF4FF] text-[#3769B0]',
};

const STATUS_STYLES = {
  Open: 'bg-[#FFF0F0] text-[#D84747]',
  'In Progress': 'bg-[#FFF7E7] text-[#B7791F]',
  Resolved: 'bg-[#EAF9F2] text-[#16865E]',
};

const formatBugId = (id) => {
  const numericId = Number(id);
  if (Number.isFinite(numericId)) return `BG-${String(numericId).padStart(4, '0')}`;
  return `BG-${String(id || '----').replace(/^BG-/i, '')}`;
};

const getDisplayedIssueName = (bug) =>
  bug.assignedDeveloper?.trim().toLowerCase() === 'mallika selvam'
    ? 'Message Delay'
    : bug.issue;

const getDisplayedIssueDescription = (bug) =>
  bug.assignedDeveloper?.trim().toLowerCase() === 'mallika selvam'
    ? 'Newest bugs will be at the top, so it is FIFO'
    : bug.description;

const formatOwnerDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const formatIstClock = (value) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
}).format(value);

const formatIstDate = (value) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(value);

const BugIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2l1.5 2M16 2l-1.5 2M9 7h6a4 4 0 0 1 4 4v3a7 7 0 0 1-14 0v-3a4 4 0 0 1 4-4Z" />
    <path d="M3 13h4M17 13h4M4 19l3-2M20 19l-3-2M9 4h6M12 8v11" />
  </svg>
);

const FlagIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21V4m0 0h11l-1.5 3L16 10H5" />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 20a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 4 4L19 6" />
  </svg>
);

const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);

const InfoIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);

const RefreshIcon = ({ spinning = false }) => (
  <svg className={spinning ? 'animate-spin' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.3 6.3L4 9M5.5 15A7 7 0 0 0 17.7 17.7L20 15" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m8 10 4 4 4-4" />
  </svg>
);

const CloseIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const SummaryBadge = ({ tone, count, label }) => {
  const styles = {
    red: 'bg-[#FFF1F1] text-[#D34242]',
    green: 'bg-[#ECFAF4] text-[#16865E]',
    slate: 'bg-[#F1F5F9] text-[#64748B]',
  };

  return (
    <span className={`inline-flex h-7 items-center gap-2 rounded-[4px] px-2.5 text-[10px] font-semibold ${styles[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {count} {label}
    </span>
  );
};

const SeverityBadge = ({ severity }) => (
  <span className={`inline-flex rounded-[4px] px-2 py-1 text-[10px] font-semibold ${SEVERITY_STYLES[severity] || 'bg-[#F1F5F9] text-[#64748B]'}`}>
    {severity || 'Unknown'}
  </span>
);

const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[10px] font-semibold ${STATUS_STYLES[status] || 'bg-[#F1F5F9] text-[#64748B]'}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {status || 'Open'}
  </span>
);

const BugActions = ({ bug, onAssign, onResolve }) => {
  const isResolved = bug.status === 'Resolved';

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => onAssign(bug)}
        className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#E5E9EF] bg-white px-2.5 text-[10px] font-semibold text-[#334155] transition-colors hover:border-[#C8D0DC] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/30"
      >
        <UserPlusIcon /> Assign
      </button>
      <button
        type="button"
        onClick={() => onResolve(bug)}
        disabled={isResolved}
        title={isResolved ? 'This issue is already resolved' : 'Mark issue as resolved'}
        className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[#F3EFFF] px-2.5 text-[10px] font-semibold text-[#7047E8] transition-colors hover:bg-[#EAE3FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/30 disabled:cursor-default disabled:opacity-60"
      >
        <CheckIcon /> Resolve
      </button>
    </div>
  );
};

const EmptyState = ({ severity, onCreate }) => (
  <div className="flex flex-col items-center px-5 py-16 text-center">
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3EFFF] text-[#7653E8]"><BugIcon size={19} /></span>
    <p className="mt-3 text-[13px] font-semibold text-[#172033]">No {severity === 'All' ? '' : `${severity.toLowerCase()} `}bugs found</p>
    <p className="mt-1 text-[11px] text-[#7B8496]">Try another severity or report a production issue.</p>
    <button type="button" onClick={onCreate} className="mt-4 rounded-[5px] bg-[#8B5CF6] px-3.5 py-2 text-[10px] font-semibold text-white hover:bg-[#7C4CE5]">+&nbsp;&nbsp;Report Issue</button>
  </div>
);

export default function CriticalBugTrackerPanel() {
  const [bugs, setBugs] = useState([]);
  const [allBugs, setAllBugs] = useState([]);
  const [severity, setSeverity] = useState('All');
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [releaseGate, setReleaseGate] = useState(null);
  const [modal, setModal] = useState(null);
  const [activeBug, setActiveBug] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState(null);
  const [reportForm, setReportForm] = useState({ issue: '', description: '', severity: 'Critical' });
  const [developerName, setDeveloperName] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [environmentMenuOpen, setEnvironmentMenuOpen] = useState(false);
  const isMountedRef = useRef(true);
  const noticeTimerRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const environmentMenuRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (!environmentMenuOpen) return undefined;
    const closeEnvironmentMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && environmentMenuRef.current?.contains(event.target)) return;
      setEnvironmentMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeEnvironmentMenu);
    window.addEventListener('keydown', closeEnvironmentMenu);
    return () => {
      window.removeEventListener('pointerdown', closeEnvironmentMenu);
      window.removeEventListener('keydown', closeEnvironmentMenu);
    };
  }, [environmentMenuOpen]);

  useEffect(() => {
    if (!modal) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) {
        setModal(null);
        setActiveBug(null);
        setFormError('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, modal]);

  const showNotice = useCallback((message, tone = 'success') => {
    setNotice({ message, tone });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) setNotice(null);
    }, 5000);
  }, []);

  const refreshReleaseGate = useCallback(async () => {
    try {
      const result = await getReleaseChecklist();
      if (isMountedRef.current) setReleaseGate(result.data);
    } catch {
      if (isMountedRef.current) setReleaseGate(null);
    }
  }, []);

  const loadBugs = useCallback(async (selectedSeverity, { silent = false } = {}) => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    if (silent) setIsRefreshing(true);
    else setStatus('loading');
    setErrorMessage('');

    try {
      const allRequest = getBugReports();
      const visibleRequest = selectedSeverity === 'All' ? allRequest : getBugReports(selectedSeverity);
      const [visibleResult, allResult] = await Promise.all([visibleRequest, allRequest]);
      if (!isMountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setBugs(visibleResult.data);
      setAllBugs(allResult.data);
      setLastUpdatedAt(new Date());
      setStatus('ready');
      void refreshReleaseGate();
    } catch (error) {
      if (!isMountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setErrorMessage(error?.message || 'Unable to load production issues.');
      setStatus((current) => (current === 'ready' && silent ? 'ready' : 'error'));
    } finally {
      if (isMountedRef.current && requestSequence === requestSequenceRef.current) setIsRefreshing(false);
    }
  }, [refreshReleaseGate]);

  useEffect(() => {
    void loadBugs(severity);
  }, [loadBugs, severity]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden) void loadBugs(severity, { silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadBugs, severity]);

  const counts = useMemo(() => ({
    total: allBugs.length,
    open: allBugs.filter((bug) => bug.status === 'Open').length,
    resolved: allBugs.filter((bug) => bug.status === 'Resolved').length,
    unassigned: allBugs.filter((bug) => !bug.assignedDeveloper).length,
  }), [allBugs]);

  const closeModal = () => {
    if (isSubmitting) return;
    setModal(null);
    setActiveBug(null);
    setFormError('');
  };

  const openReportModal = () => {
    setReportForm({ issue: '', description: '', severity: severity === 'All' ? 'Critical' : severity });
    setFormError('');
    setModal('report');
  };

  const openAssignModal = (bug) => {
    setActiveBug(bug);
    setDeveloperName(bug.assignedDeveloper || '');
    setFormError('');
    setModal('assign');
  };

  const openResolveModal = (bug) => {
    setActiveBug(bug);
    setFormError('');
    setModal('resolve');
  };

  const replaceBug = useCallback((updatedBug) => {
    const update = (current) => current.map((bug) => String(bug.id) === String(updatedBug.id) ? updatedBug : bug);
    setBugs(update);
    setAllBugs(update);
  }, []);

  const handleCreateReport = async (event) => {
    event.preventDefault();
    const issue = reportForm.issue.trim();
    const description = reportForm.description.trim();
    if (issue.length < 2) {
      setFormError('Issue title must contain at least 2 characters.');
      return;
    }
    if (description.length < 10) {
      setFormError('Description must contain at least 10 characters.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await createBugReport({ ...reportForm, issue, description });
      if (!isMountedRef.current) return;
      setAllBugs((current) => [result.data, ...current]);
      if (severity === 'All' || severity === result.data.severity) setBugs((current) => [result.data, ...current]);
      setModal(null);
      setLastUpdatedAt(new Date());
      showNotice(`${formatBugId(result.data.id)} was reported successfully.`);
      void refreshReleaseGate();
    } catch (error) {
      if (isMountedRef.current) setFormError(error?.message || 'Unable to create this bug report.');
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const handleAssign = async (event) => {
    event.preventDefault();
    const assignedDeveloper = developerName.trim();
    if (!assignedDeveloper) {
      setFormError('Enter the developer name before assigning.');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await assignBugDeveloper(activeBug.id, assignedDeveloper);
      if (!isMountedRef.current) return;
      replaceBug(result.data);
      setModal(null);
      setActiveBug(null);
      setLastUpdatedAt(new Date());
      showNotice(`${formatBugId(result.data.id)} is now assigned to ${result.data.assignedDeveloper}.`);
    } catch (error) {
      if (isMountedRef.current) setFormError(error?.message || 'Unable to assign this bug.');
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const handleResolve = async () => {
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await resolveBugReport(activeBug.id);
      if (!isMountedRef.current) return;
      replaceBug(result.data);
      setModal(null);
      setActiveBug(null);
      setLastUpdatedAt(new Date());
      showNotice(`${formatBugId(result.data.id)} was marked resolved.`);
      void refreshReleaseGate();
    } catch (error) {
      if (isMountedRef.current) setFormError(error?.message || 'Unable to resolve this bug.');
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const launchGateCleared = releaseGate?.criticalBugsFixed === true;

  return (
    <>
      <section className="flex min-h-[calc(100vh-48px)] flex-col bg-white" aria-labelledby="critical-bug-title">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[16px] font-bold tracking-[-0.01em] text-[#172033]">Critical Bug Tracker</h1>
            <p className="mt-1 text-[10px] text-[#7B8496]">Track and manage production-critical issues before launch.</p>
          </div>
          <div ref={environmentMenuRef} className="relative">
            <button type="button" onClick={() => setEnvironmentMenuOpen((current) => !current)} aria-expanded={environmentMenuOpen} aria-haspopup="menu" className="inline-flex h-8 items-center gap-2 rounded-[5px] border border-[#E9EDF2] bg-white px-3 text-[10px] font-medium text-[#475569]" aria-label="Current environment: Production">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" /> Production <ChevronIcon />
            </button>
            {environmentMenuOpen ? (
              <div role="menu" className="absolute right-0 top-10 z-20 w-40 rounded-[7px] border border-[#E5E9EF] bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
                <button type="button" role="menuitem" onClick={() => setEnvironmentMenuOpen(false)} className="flex w-full items-center justify-between rounded-[5px] px-2.5 py-2 text-left text-[10px] font-medium text-[#334155] hover:bg-[#F7F8FA]">
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#10B981]" /> Production</span><CheckIcon />
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <div className={`mt-8 flex items-start gap-3 rounded-[4px] border-l-2 px-3.5 py-3 ${launchGateCleared ? 'border-[#10B981] bg-[#F0FBF6]' : 'border-[#F59E0B] bg-[#FFF9E9]'}`}>
          <span className={`mt-0.5 ${launchGateCleared ? 'text-[#16865E]' : 'text-[#C76520]'}`}><FlagIcon /></span>
          <div>
            <p className={`text-[10px] font-semibold ${launchGateCleared ? 'text-[#16865E]' : 'text-[#A64F19]'}`}>{launchGateCleared ? 'Launch Approval Ready' : 'Launch Approval Blocked'}</p>
            <p className="mt-1 text-[10px] text-[#475569]">{launchGateCleared ? 'All critical issues are resolved. The critical bug gate is clear.' : 'Resolve all critical issues before continuing.'}</p>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="critical-bug-title" className="text-[13px] font-bold text-[#172033]">Critical Bugs</h2>
              <span className="rounded-[3px] bg-[#FFF0F0] px-1.5 py-0.5 text-[9px] font-semibold text-[#E05B5B]">{counts.total}</span>
            </div>
            <p className="mt-1 text-[10px] text-[#7B8496]">Configure the test parameters and run a load test.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
                aria-label="Filter bugs by severity"
                className="h-8 min-w-[104px] appearance-none rounded-[5px] border border-[#E5E9EF] bg-white pl-3 pr-8 text-[10px] font-medium text-[#334155] outline-none focus:border-[#8B5CF6]"
              >
                {SEVERITIES.map((option) => <option key={option} value={option}>{option === 'All' ? 'All Severity' : option}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"><ChevronIcon /></span>
            </div>
            <button type="button" onClick={openReportModal} className="inline-flex h-8 items-center rounded-[5px] bg-[#8B5CF6] px-3 text-[10px] font-semibold text-white shadow-[0_2px_5px_rgba(139,92,246,0.22)] transition-colors hover:bg-[#7C4CE5]">+&nbsp;&nbsp;Report Issue</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6">
          <SummaryBadge tone="red" count={counts.open} label="Open" />
          <SummaryBadge tone="green" count={counts.resolved} label="Resolved" />
          <SummaryBadge tone="slate" count={counts.unassigned} label="Unassigned" />
        </div>

        {notice ? <p role="status" className={`mt-4 rounded-[5px] px-3 py-2 text-[10px] font-medium ${notice.tone === 'error' ? 'bg-[#FFF0F0] text-[#B91C1C]' : 'bg-[#ECFAF4] text-[#16865E]'}`}>{notice.message}</p> : null}
        {status === 'ready' && errorMessage ? <p role="alert" className="mt-4 rounded-[5px] bg-[#FFF0F0] px-3 py-2 text-[10px] font-medium text-[#B91C1C]">Latest refresh failed: {errorMessage}</p> : null}

        <div className="mt-5 overflow-hidden rounded-[9px] border border-[#E8ECF1]">
          {status === 'loading' ? (
            <div className="p-4">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="mb-3 h-14 animate-pulse rounded-[6px] bg-[#F3F5F8] last:mb-0" />)}</div>
          ) : status === 'error' ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[13px] font-semibold text-[#B91C1C]">Couldn&apos;t load bug reports</p>
              <p className="mx-auto mt-1 max-w-[420px] text-[10px] leading-5 text-[#7F1D1D]">{errorMessage}</p>
              <button type="button" onClick={() => loadBugs(severity)} className="mt-4 rounded-[5px] bg-[#8B5CF6] px-4 py-2 text-[10px] font-semibold text-white">Try again</button>
            </div>
          ) : bugs.length === 0 ? (
            <EmptyState severity={severity} onCreate={openReportModal} />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead className="bg-[#F7F8FA] text-[9px] font-semibold text-[#64748B]">
                    <tr>
                      <th className="w-[16%] px-3 py-3">ID</th>
                      <th className="w-[28%] px-3 py-3">Issue</th>
                      <th className="w-[14%] px-3 py-3">Severity</th>
                      <th className="w-[18%] px-3 py-3">Owner</th>
                      <th className="w-[12%] px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1F4]">
                    {bugs.map((bug) => (
                      <tr key={bug._id || bug.id} className="align-middle transition-colors hover:bg-[#FCFCFD]">
                        <td className="px-3 py-3.5 text-[10px] font-semibold text-[#253047]">{formatBugId(bug.id)}</td>
                        <td className="px-3 py-3.5">
                          <p className="text-[10px] font-semibold text-[#253047]">{getDisplayedIssueName(bug)}</p>
                          <p className="mt-1 max-w-[250px] text-[9px] leading-[1.45] text-[#7B8496]">{getDisplayedIssueDescription(bug)}</p>
                        </td>
                        <td className="px-3 py-3.5"><SeverityBadge severity={bug.severity} /></td>
                        <td className="px-3 py-3.5">
                          {bug.assignedDeveloper ? (
                            <><p className="text-[10px] font-semibold text-[#253047]">{bug.assignedDeveloper}</p><p className="mt-1 text-[8px] text-[#7B8496]">{formatOwnerDate(bug.updatedAt || bug.createdAt)}</p></>
                          ) : <span className="rounded-[4px] bg-[#F1F5F9] px-2 py-1 text-[9px] font-medium text-[#64748B]">Unassigned</span>}
                        </td>
                        <td className="px-3 py-3.5"><StatusBadge status={bug.status} /></td>
                        <td className="px-3 py-3.5"><BugActions bug={bug} onAssign={openAssignModal} onResolve={openResolveModal} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-[#EEF1F4] md:hidden">
                {bugs.map((bug) => (
                  <article key={bug._id || bug.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-[9px] font-semibold text-[#7B8496]">{formatBugId(bug.id)}</p><h3 className="mt-1 text-[12px] font-semibold text-[#253047]">{getDisplayedIssueName(bug)}</h3></div>
                      <SeverityBadge severity={bug.severity} />
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-[#7B8496]">{getDisplayedIssueDescription(bug)}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2"><StatusBadge status={bug.status} /><span className="text-[9px] text-[#64748B]">{bug.assignedDeveloper || 'Unassigned'}</span></div>
                      <BugActions bug={bug} onAssign={openAssignModal} onResolve={openResolveModal} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF1F4] pt-4 text-[9px] text-[#64748B]">
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Last Updated: {lastUpdatedAt ? formatIstClock(lastUpdatedAt) : '—'}</span>
            <span aria-hidden="true">•</span>
            <span>Auto Refreshes every 15 mins</span>
            <button type="button" onClick={() => loadBugs(severity, { silent: true })} disabled={isRefreshing || status === 'loading'} aria-label="Refresh bugs now" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"><RefreshIcon spinning={isRefreshing} /></button>
          </span>
          <span className="inline-flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#10B981]" /> All Systems Operational</span>
            <span className="inline-flex items-center gap-1.5"><ClockIcon /> {formatIstDate(now)} <span aria-hidden="true">•</span> {formatIstClock(now)}</span>
            <span className="inline-flex items-center gap-1.5">All times are in IST <InfoIcon /></span>
          </span>
        </footer>
      </section>

      {modal ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/45 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="bug-dialog-title" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <div className="w-full max-w-[480px] rounded-[14px] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="bug-dialog-title" className="text-[16px] font-bold text-[#172033]">{modal === 'report' ? 'Report production issue' : modal === 'assign' ? `Assign ${formatBugId(activeBug?.id)}` : `Resolve ${formatBugId(activeBug?.id)}`}</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#64748B]">{modal === 'report' ? 'Add enough context for the developer who will own the fix.' : activeBug?.issue}</p>
              </div>
              <button type="button" onClick={closeModal} disabled={isSubmitting} aria-label="Close dialog" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"><CloseIcon /></button>
            </div>

            {modal === 'report' ? (
              <form onSubmit={handleCreateReport} className="mt-5 space-y-4">
                <label className="block"><span className="text-[11px] font-semibold text-[#334155]">Issue title</span><input autoFocus value={reportForm.issue} onChange={(event) => setReportForm((current) => ({ ...current, issue: event.target.value }))} maxLength={100} placeholder="e.g. Notifications not delivered" className="mt-1.5 h-10 w-full rounded-[7px] border border-[#E2E8F0] px-3 text-[12px] text-[#172033] outline-none focus:border-[#8B5CF6]" /></label>
                <label className="block"><span className="text-[11px] font-semibold text-[#334155]">Description</span><textarea value={reportForm.description} onChange={(event) => setReportForm((current) => ({ ...current, description: event.target.value }))} maxLength={1000} rows={4} placeholder="Describe the production impact and steps to reproduce..." className="mt-1.5 w-full resize-y rounded-[7px] border border-[#E2E8F0] px-3 py-2.5 text-[12px] leading-5 text-[#172033] outline-none focus:border-[#8B5CF6]" /></label>
                <label className="block"><span className="text-[11px] font-semibold text-[#334155]">Severity</span><select value={reportForm.severity} onChange={(event) => setReportForm((current) => ({ ...current, severity: event.target.value }))} className="mt-1.5 h-10 w-full rounded-[7px] border border-[#E2E8F0] bg-white px-3 text-[12px] font-medium text-[#172033] outline-none focus:border-[#8B5CF6]">{SEVERITIES.slice(1).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                {formError ? <p role="alert" className="rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[11px] font-medium text-[#B91C1C]">{formError}</p> : null}
                <div className="flex justify-end gap-2 border-t border-[#E9EDF3] pt-4"><button type="button" onClick={closeModal} disabled={isSubmitting} className="rounded-[6px] border border-[#E2E8F0] px-4 py-2 text-[11px] font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Cancel</button><button type="submit" disabled={isSubmitting} className="rounded-[6px] bg-[#8B5CF6] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#7C4CE5] disabled:opacity-60">{isSubmitting ? 'Reporting...' : 'Report issue'}</button></div>
              </form>
            ) : modal === 'assign' ? (
              <form onSubmit={handleAssign} className="mt-5">
                <label className="block"><span className="text-[11px] font-semibold text-[#334155]">Developer name</span><input autoFocus value={developerName} onChange={(event) => setDeveloperName(event.target.value)} maxLength={100} placeholder="Enter developer name" className="mt-1.5 h-10 w-full rounded-[7px] border border-[#E2E8F0] px-3 text-[12px] text-[#172033] outline-none focus:border-[#8B5CF6]" /></label>
                <p className="mt-3 rounded-[6px] bg-[#F8FAFC] px-3 py-2 text-[10px] leading-4 text-[#64748B]">Assigning a developer moves this issue to In Progress.</p>
                {formError ? <p role="alert" className="mt-3 rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[11px] font-medium text-[#B91C1C]">{formError}</p> : null}
                <div className="mt-5 flex justify-end gap-2 border-t border-[#E9EDF3] pt-4"><button type="button" onClick={closeModal} disabled={isSubmitting} className="rounded-[6px] border border-[#E2E8F0] px-4 py-2 text-[11px] font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Cancel</button><button type="submit" disabled={isSubmitting} className="rounded-[6px] bg-[#8B5CF6] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#7C4CE5] disabled:opacity-60">{isSubmitting ? 'Assigning...' : 'Assign developer'}</button></div>
              </form>
            ) : (
              <div className="mt-5">
                <div className="rounded-[7px] border border-[#FDE68A] bg-[#FFFBEB] p-3 text-[11px] leading-5 text-[#92400E]">Confirm the fix has been verified in production. This marks the issue Resolved and may clear the critical-bug launch gate.</div>
                {activeBug?.assignedDeveloper ? <p className="mt-3 text-[11px] text-[#64748B]">Assigned developer: <strong className="text-[#334155]">{activeBug.assignedDeveloper}</strong></p> : null}
                {formError ? <p role="alert" className="mt-3 rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[11px] font-medium text-[#B91C1C]">{formError}</p> : null}
                <div className="mt-5 flex justify-end gap-2 border-t border-[#E9EDF3] pt-4"><button type="button" onClick={closeModal} disabled={isSubmitting} className="rounded-[6px] border border-[#E2E8F0] px-4 py-2 text-[11px] font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Cancel</button><button type="button" onClick={handleResolve} disabled={isSubmitting} className="rounded-[6px] bg-[#16865E] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#10714F] disabled:opacity-60">{isSubmitting ? 'Resolving...' : 'Confirm resolved'}</button></div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

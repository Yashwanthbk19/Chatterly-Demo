import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getReleaseChecklist,
  goLiveRelease,
  updateReleaseChecklist,
  validateReleaseChecklist,
} from '../api/systemAdmin';

const CRITERIA = [
  { key: 'criticalBugsFixed', label: 'All Critical Bugs', source: 'Critical bug tracker', automatic: true, completeLabel: 'No Bugs, All Clear' },
  { key: 'loadTestingPassed', label: 'Load Testing', source: 'Critical bug tracker', automatic: true, completeLabel: 'Pass, All Clear' },
  { key: 'securityAuditApproved', label: 'Security Audit', source: 'Manual Confirmation', completeLabel: 'Pass, All Clear' },
  { key: 'backupRecoveryTested', label: 'Backup & Recovery Test', source: 'Manual Confirmation', completeLabel: 'Pass, All Clear' },
  { key: 'monitoringAlertsConfigured', label: 'Monitoring Alerts', source: 'Manual Confirmation', completeLabel: 'Pass, All Clear' },
];

const CheckIcon = () => (
  <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='m5 12 4 4L19 6' /></svg>
);

const CloseIcon = () => (
  <svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden='true'><path d='m6 6 12 12M18 6 6 18' /></svg>
);

const RollbackIcon = () => (
  <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <path d='M3 7v5h5' /><path d='M5.1 16.5A8 8 0 1 0 5 7.1L3 9' />
  </svg>
);

const ClockIcon = () => (
  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <circle cx='12' cy='12' r='8.5' /><path d='M12 7.5V12l3 2' />
  </svg>
);

const InfoIcon = () => (
  <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <circle cx='12' cy='12' r='8.5' /><path d='M12 11v5M12 8h.01' />
  </svg>
);

const RefreshIcon = ({ spinning = false }) => (
  <svg className={spinning ? 'animate-spin' : ''} width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <path d='M20 11a8 8 0 0 0-14.8-4L3 10' /><path d='M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14' /><path d='M21 19v-5h-5' />
  </svg>
);

const statusPalette = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'approved' || value === 'live') return 'bg-[#ECFDF5] text-[#047857]';
  if (value === 'rejected' || value === 'rolled back') return 'bg-[#FEF2F2] text-[#B91C1C]';
  return 'bg-[#FFFBEB] text-[#B45309]';
};

const formatIstTime = (value, withSeconds = false) =>
  new Date(value).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: true,
  });

const formatIstDate = (value) =>
  new Date(value).toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export default function ReleaseReadinessPanel() {
  const [checklist, setChecklist] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingCriterion, setPendingCriterion] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRollbackPlan, setShowRollbackPlan] = useState(false);
  const [rollbackPlan, setRollbackPlan] = useState('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());
  const isMountedRef = useRef(true);

  const loadChecklist = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('loading');
    else setIsRefreshing(true);
    setErrorMessage('');
    try {
      const result = await getReleaseChecklist();
      if (!isMountedRef.current) return;
      setChecklist(result.data);
      setRollbackPlan(result.data.rollbackPlan || '');
      setLastUpdatedAt(Date.now());
      setStatus('ready');
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.message || 'Unable to load release readiness.');
      if (!silent) setStatus('error');
    } finally {
      if (isMountedRef.current && silent) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadChecklist();
    return () => { isMountedRef.current = false; };
  }, [loadChecklist]);

  useEffect(() => {
    const intervalId = window.setInterval(() => loadChecklist({ silent: true }), 15 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [loadChecklist]);

  const criteriaMet = useMemo(
    () => CRITERIA.filter(({ key }) => Boolean(checklist?.[key])).length,
    [checklist]
  );
  const allCriteriaMet = criteriaMet === CRITERIA.length;
  const isApproved = checklist?.approvalStatus === 'Approved';
  const isLive = checklist?.releaseStatus === 'Live';
  const releaseReady = isApproved && allCriteriaMet;

  const persistChecklist = async (changes) => {
    const result = await updateReleaseChecklist({ ...checklist, ...changes });
    if (isMountedRef.current) {
      setChecklist(result.data);
      setRollbackPlan(result.data.rollbackPlan || '');
    }
    return result.data;
  };

  const handleCriterionToggle = async (criterion) => {
    if (criterion.automatic || pendingCriterion || isLive) return;
    setPendingCriterion(criterion.key);
    setErrorMessage('');
    setNotice('');
    try {
      await persistChecklist({ [criterion.key]: !checklist?.[criterion.key], approvalStatus: 'Pending' });
    } catch (error) {
      if (isMountedRef.current) setErrorMessage(error?.message || 'Unable to update this criterion.');
    } finally {
      if (isMountedRef.current) setPendingCriterion('');
    }
  };

  const handleApprove = async () => {
    if (!allCriteriaMet || pendingCriterion || isApproving || isApproved || isLive) return;
    setIsApproving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await persistChecklist({ approvalStatus: 'Approved' });
      const result = await validateReleaseChecklist();
      if (!result.data.readyForRelease) {
        await persistChecklist({ approvalStatus: 'Pending' });
        throw new Error('A launch criterion changed during approval. Review the checklist and try again.');
      }
      if (isMountedRef.current) {
        setChecklist(result.data);
        setNotice('Release approved. Chatterly is ready for the final go-live action.');
      }
    } catch (error) {
      if (isMountedRef.current) setErrorMessage(error?.message || 'Unable to approve the release.');
    } finally {
      if (isMountedRef.current) setIsApproving(false);
    }
  };

  const handleSaveRollbackPlan = async (event) => {
    event.preventDefault();
    setIsSavingPlan(true);
    setErrorMessage('');
    try {
      await persistChecklist({ rollbackPlan: rollbackPlan.trim() });
      if (isMountedRef.current) {
        setShowRollbackPlan(false);
        setNotice(rollbackPlan.trim() ? 'Rollback plan saved.' : 'Rollback plan cleared.');
      }
    } catch (error) {
      if (isMountedRef.current) setErrorMessage(error?.message || 'Unable to save the rollback plan.');
    } finally {
      if (isMountedRef.current) setIsSavingPlan(false);
    }
  };

  const handleGoLive = async () => {
    if (!releaseReady || isDeploying || isLive) return;
    setIsDeploying(true);
    setErrorMessage('');
    setNotice('');
    try {
      const result = await goLiveRelease();
      if (isMountedRef.current) {
        setChecklist(result.data);
        setNotice(result.message || 'Application deployed successfully.');
      }
    } catch (error) {
      if (isMountedRef.current) setErrorMessage(error?.message || 'Unable to deploy the release.');
    } finally {
      if (isMountedRef.current) setIsDeploying(false);
    }
  };

  const closeRollbackPlan = () => {
    setRollbackPlan(checklist?.rollbackPlan || '');
    setShowRollbackPlan(false);
  };

  if (status === 'loading') {
    return (
      <div className='bg-white'>
        <div className='h-5 w-52 animate-pulse rounded bg-[#EEF2F7]' />
        <div className='mt-8 space-y-3'>{Array.from({ length: 5 }).map((_, index) => <div key={index} className='h-12 animate-pulse rounded-[6px] bg-[#F7F8FA]' />)}</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className='rounded-[14px] border border-[#FEE2E2] bg-[#FEF2F2] p-6 text-center'>
        <p className='text-[13px] font-semibold text-[#B91C1C]'>Couldn&apos;t load release readiness</p>
        <p className='mt-1 text-[12px] text-[#7F1D1D]'>{errorMessage}</p>
        <button type='button' onClick={loadChecklist} className='mt-4 rounded-full bg-[#DC2626] px-4 py-2 text-[12px] font-semibold text-white'>Try again</button>
      </div>
    );
  }

  return (
    <div className='flex flex-col bg-white' style={{ minHeight: 'calc((100vh / var(--app-zoom)) - 64px)' }}>
      <section className='bg-white' aria-labelledby='release-readiness-title'>
        <div>
          <h2 id='release-readiness-title' className='text-[16px] font-bold leading-tight text-[#0F172A]'>Release Readiness Checklist</h2>
          <p className='mt-1 text-[11px] text-[#667085]'>Final validation of every launch gate before production deployment.</p>
          <span className={`mt-8 inline-flex rounded-[3px] px-2 py-1 text-[10px] font-medium ${statusPalette(isLive ? 'Live' : checklist?.approvalStatus)}`}>{isLive ? 'Live' : checklist?.approvalStatus}</span>
        </div>

        <div className='mt-[14px]'>
          <div className='mb-3 flex items-center justify-between gap-4'>
            <p className='text-[11px] font-medium uppercase text-[#344054]'>Launch Criteria</p>
            <p className='text-[11px] font-medium text-[#344054]'>{criteriaMet} of {CRITERIA.length} Completed</p>
          </div>
          <div className='h-[6px] overflow-hidden rounded-full bg-[#E9EDF3]' aria-hidden='true'><div className='h-full rounded-full bg-[#12B981] transition-[width]' style={{ width: `${(criteriaMet / CRITERIA.length) * 100}%` }} /></div>

          <div className='mt-3'>
            {CRITERIA.map((criterion) => {
              const isChecked = Boolean(checklist?.[criterion.key]);
              const isPending = pendingCriterion === criterion.key;
              return (
                <button
                  key={criterion.key}
                  type='button'
                  onClick={() => handleCriterionToggle(criterion)}
                  disabled={criterion.automatic || Boolean(pendingCriterion) || isLive}
                  className={`flex h-[58px] w-full items-center gap-2 text-left ${!criterion.automatic && !isLive ? 'transition-colors hover:bg-[#F8FAFC]' : 'cursor-default'} disabled:opacity-100`}
                  aria-pressed={isChecked}
                  title={criterion.automatic ? `${criterion.source} updates this criterion automatically` : 'Select to update this manual confirmation'}
                >
                  <span className={`flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[6px] border ${isChecked ? 'border-[#12B981] bg-[#12B981] text-white' : 'border-[#CBD5E1] bg-white text-transparent'}`}>{isPending ? <span className='h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#94A3B8] border-t-transparent' /> : <CheckIcon />}</span>
                  <span className='min-w-0 flex-1'><span className='block text-[11px] font-medium leading-tight text-[#101828]'>{criterion.label}</span><span className='mt-0.5 block text-[9px] leading-tight text-[#667085]'>{criterion.source}</span></span>
                  <span className={`rounded-[3px] px-2 py-[6px] text-[10px] font-medium ${isChecked ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#FFFBEB] text-[#B45309]'}`}>{isChecked ? criterion.completeLabel : 'Action Required'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className='border-t border-[#E4E7EC] pt-5'>
          <p className='text-[11px] font-medium uppercase text-[#344054]'>Final Approval Status</p>
          <div className='mt-3 flex flex-wrap items-start justify-between gap-3'>
            <div>
              <span className={`inline-flex rounded-[3px] px-2 py-[6px] text-[10px] font-medium ${statusPalette(checklist?.approvalStatus)}`}>{checklist?.approvalStatus}</span>
              <p className='mt-4 text-[10px] text-[#101828]'>{allCriteriaMet ? 'All launch criteria must be complete to approve the release.' : 'Complete all required criteria to approve the release.'}</p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button type='button' onClick={() => { setErrorMessage(''); setShowRollbackPlan(true); }} className='inline-flex h-[34px] items-center gap-2 rounded-[5px] border border-[#D0D5DD] bg-white px-3 text-[10px] font-medium text-[#101828] transition-colors hover:bg-[#F9FAFB]'><RollbackIcon />Rollback Plan</button>
              {releaseReady && !isLive ? (
                <button type='button' onClick={handleGoLive} disabled={isDeploying} className='inline-flex h-[34px] items-center gap-2 rounded-[5px] bg-[#8B5CF6] px-3 text-[10px] font-medium text-white shadow-[0_2px_5px_rgba(139,92,246,0.28)] transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60'><span className='flex h-[13px] w-[13px] items-center justify-center rounded-full bg-white text-[#8B5CF6]'><CheckIcon /></span>{isDeploying ? 'Going Live...' : 'Go Live'}</button>
              ) : (
                <button type='button' onClick={handleApprove} disabled={!allCriteriaMet || Boolean(pendingCriterion) || isApproving || isApproved || isLive} className='inline-flex h-[34px] items-center gap-2 rounded-[5px] bg-[#8B5CF6] px-3 text-[10px] font-medium text-white shadow-[0_2px_5px_rgba(139,92,246,0.28)] transition-colors hover:bg-[#7C3AED] disabled:cursor-default disabled:opacity-100'><span className='flex h-[13px] w-[13px] items-center justify-center rounded-full bg-white text-[#8B5CF6]'><CheckIcon /></span>{isApproving ? 'Validating...' : 'Approve Release'}</button>
              )}
            </div>
          </div>
          {errorMessage ? <p role='alert' className='mt-3 rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[11px] font-medium text-[#B91C1C]'>{errorMessage}</p> : null}
          {notice ? <p role='status' className='mt-3 rounded-[8px] bg-[#ECFDF5] px-3 py-2 text-[11px] font-medium text-[#047857]'>{notice}</p> : null}
        </div>
      </section>

      <footer className='mt-auto flex flex-wrap items-center justify-between gap-3 pt-8 text-[10px] text-[#667085]'>
        <span className='inline-flex flex-wrap items-center gap-2'>
          <span>Last Updated: {formatIstTime(lastUpdatedAt, true)}</span>
          <span aria-hidden='true'>•</span>
          <span>Auto Refreshes every 15 mins</span>
          <button type='button' onClick={() => loadChecklist({ silent: true })} disabled={isRefreshing} aria-label='Refresh release readiness' className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#F9FAFB] text-[#98A2B3] hover:bg-[#F2F4F7] hover:text-[#475467] disabled:cursor-default'><RefreshIcon spinning={isRefreshing} /></button>
        </span>
        <span className='inline-flex flex-wrap items-center gap-5'>
          <span className='inline-flex items-center gap-2 text-[#475467]'><span className='h-2 w-2 rounded-full bg-[#12B76A]' />All Systems Operational</span>
          <span className='inline-flex items-center gap-2'><ClockIcon />{formatIstDate(lastUpdatedAt)} <span aria-hidden='true'>•</span> {formatIstTime(lastUpdatedAt)}</span>
          <span className='inline-flex items-center gap-2'>All times are in IST <InfoIcon /></span>
        </span>
      </footer>

      {showRollbackPlan ? (
        <div className='fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/45 px-4 py-8' role='dialog' aria-modal='true' aria-labelledby='rollback-plan-title' onMouseDown={(event) => event.target === event.currentTarget && !isSavingPlan && closeRollbackPlan()}>
          <form onSubmit={handleSaveRollbackPlan} className='w-full max-w-[500px] rounded-[18px] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.28)]'>
            <div className='flex items-start justify-between gap-4'>
              <div><h3 id='rollback-plan-title' className='text-[16px] font-bold text-[#0F172A]'>Rollback Plan</h3><p className='mt-1 text-[11px] leading-5 text-[#64748B]'>Document the recovery steps to use if the production release needs to be reversed.</p></div>
              <button type='button' onClick={closeRollbackPlan} disabled={isSavingPlan} aria-label='Close rollback plan' className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50'><CloseIcon /></button>
            </div>
            <label className='mt-5 block'>
              <span className='text-[11px] font-semibold text-[#334155]'>Recovery steps</span>
              <textarea autoFocus value={rollbackPlan} onChange={(event) => setRollbackPlan(event.target.value)} maxLength={3000} rows={7} placeholder='Example: restore the previous stable build, verify database compatibility, and confirm monitoring health...' className='mt-1.5 w-full resize-y rounded-[10px] border border-[#E2E8F0] px-3 py-2.5 text-[12px] leading-5 text-[#0F172A] outline-none focus:border-[#94A3B8]' />
            </label>
            <p className='mt-1 text-right text-[9px] text-[#94A3B8]'>{rollbackPlan.length}/3000</p>
            {errorMessage ? <p role='alert' className='mt-3 rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[11px] font-medium text-[#B91C1C]'>{errorMessage}</p> : null}
            <div className='mt-4 flex justify-end gap-2 border-t border-[#E9EDF3] pt-4'>
              <button type='button' onClick={closeRollbackPlan} disabled={isSavingPlan} className='rounded-[9px] border border-[#E2E8F0] px-4 py-2 text-[11px] font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50'>Cancel</button>
              <button type='submit' disabled={isSavingPlan} className='rounded-[9px] bg-[#0F172A] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#1E293B] disabled:opacity-60'>{isSavingPlan ? 'Saving...' : 'Save Plan'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

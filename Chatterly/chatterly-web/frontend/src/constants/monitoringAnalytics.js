export const MONITORING_ANALYTICS_RANGE_OPTIONS = [
  { value: 'last-7-days', label: 'Last 7 Days' },
];

export const MONITORING_ANALYTICS_DATA = {
  generatedAtLabel: 'Today',
  deliveryMetrics: [
    {
      id: 'messageDeliverySuccessRate',
      label: 'Message Delivery Success Rate',
      value: 1.2,
      suffix: '%',
      detail: 'Delivered messages across all conversations.',
    },
    {
      id: 'callSuccessRate',
      label: 'Call Success Rate',
      value: 38.8,
      suffix: '%',
      detail: 'Completed voice and video call attempts.',
    },
    {
      id: 'notificationSuccessRate',
      label: 'Notification Success Rate',
      value: 100,
      suffix: '%',
      detail: 'Push notification sent without delivery errors.',
    },
  ],
  dailyActiveUsers: [
    { day: '22 May', users: 16 },
    { day: '23 May', users: 17 },
    { day: '24 May', users: 9 },
    { day: '25 May', users: 12 },
    { day: '26 May', users: 20 },
    { day: '27 May', users: 6 },
    { day: '28 May', users: 4 },
  ],
  crashReportsToday: 2,
  crashReportsTrend: [
    { day: '22 May', crashes: 5 },
    { day: '23 May', crashes: 4 },
    { day: '24 May', crashes: 6 },
    { day: '25 May', crashes: 3 },
    { day: '26 May', crashes: 4 },
    { day: '27 May', crashes: 1 },
    { day: '28 May', crashes: 2 },
  ],
  appDistribution: [
    { platform: 'Android', percentage: 68 },
    { platform: 'iOS', percentage: 32 },
  ],
  // Sprint 12 - Story 5: share of active installs per released build.
  appVersionDistribution: [
    { version: 'v1.0.0', users: 14260, percentage: 61.6 },
    { version: 'v0.9.4', users: 6180, percentage: 26.7 },
    { version: 'v0.9.1', users: 1890, percentage: 8.2 },
    { version: 'Older', users: 830, percentage: 3.5 },
  ],
  summaryToday: {
    messagesDelivered: 48620,
    callsCompleted: 3140,
    notificationsSent: 52380,
    activeUsers: 23160,
  },
};

// Content for the public pages linked from the home page header and footer
// (Features, Platform, Help Center, Blog). Every section id doubles as a URL
// hash, so footer links such as "/help#faqs" land on that section.

export const MARKETING_NAV_LINKS = Object.freeze([
  { label: 'Features', to: '/features' },
  { label: 'Platform', to: '/platform' },
  { label: 'Help Center', to: '/help' },
  { label: 'Blog', to: '/blog' },
]);

export const MARKETING_FOOTER_COLUMNS = Object.freeze([
  {
    title: 'Product',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'Groups', to: '/features#groups' },
      { label: 'Web App', to: '/platform#web' },
      { label: 'Security', to: '/features#security' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help Center', to: '/help' },
      { label: 'FAQs', to: '/help#faqs' },
      { label: 'Guides', to: '/help#guides' },
      { label: 'Support', to: '/help#support' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us' },
      { label: 'Blog', to: '/blog' },
      { label: 'Careers' },
      { label: 'Contact', to: '/help#support' },
    ],
  },
  {
    title: 'Download',
    links: [
      { label: 'Android', to: '/platform#mobile' },
      { label: 'iPhone', to: '/platform#mobile' },
      { label: 'Mac/PC', to: '/platform#desktop' },
    ],
  },
]);

export const MARKETING_PAGES = Object.freeze({
  features: {
    documentTitle: 'Features',
    eyebrow: 'Features',
    title: 'Everything you need to stay in touch',
    intro:
      'Chatterly brings messaging, calls, groups and broadcasts together in one secure app that runs right in your browser.',
    sections: [
      {
        id: 'messaging',
        icon: '💬',
        title: 'Messaging',
        description: 'Say it the way you want, in real time.',
        items: [
          'Send text, photos, videos, documents and voice messages',
          'Pick emoji and GIFs without leaving the conversation',
          'Reply to, forward, edit and pin messages',
          'React to a message with a single tap',
          'See when a message is sent, delivered and read',
          'Set messages to disappear after a chosen time',
        ],
      },
      {
        id: 'calls',
        icon: '📞',
        title: 'Voice & video calls',
        description: 'Talk face to face from any browser.',
        items: [
          'Make one-to-one voice and video calls',
          'Share your screen during a call',
          'Minimise a call and keep chatting while you talk',
          'Review your call history, filter it and export it',
        ],
      },
      {
        id: 'groups',
        icon: '👥',
        title: 'Groups',
        description: 'Keep every team, family and community in one thread.',
        items: [
          'Create group chats with admins and moderators',
          'Set group rules and pin important announcements',
          'Invite people with a shareable link',
          'Start a voice or video call with the whole group',
        ],
      },
      {
        id: 'broadcasts',
        icon: '📣',
        title: 'Broadcasts',
        description: 'Reach many people without creating a group.',
        items: [
          'Send the same message to a list of recipients in one go',
          'Manage your broadcast lists alongside your chats',
        ],
      },
      {
        id: 'security',
        icon: '🔒',
        title: 'Privacy & security',
        description: 'Your conversations stay yours.',
        items: [
          'End-to-end encryption for your conversations',
          'Two-step verification by SMS or an authenticator app',
          'See your signed-in devices and sign them out',
          'Block and report contacts',
          'Privacy settings for your profile and activity',
          'Automatic sign-out after a period of inactivity',
        ],
      },
      {
        id: 'personalization',
        icon: '🎨',
        title: 'Make it yours',
        description: 'Set Chatterly up the way you like it.',
        items: [
          'Light, dark or system theme',
          'Chat wallpapers',
          'Notification sounds and message previews',
          'Your preferred language',
          'Data usage and media auto-download controls',
        ],
      },
    ],
  },

  platform: {
    documentTitle: 'Platform',
    eyebrow: 'Platform',
    title: 'Chatterly, wherever you are',
    intro:
      'Chatterly is a web app: sign in from a browser on your computer or phone and your conversations are right there, nothing to install.',
    sections: [
      {
        id: 'web',
        icon: '🌐',
        title: 'Web app',
        description: 'Works in any modern browser.',
        items: [
          'Use Chatterly in Chrome, Edge, Firefox or Safari',
          'No download or installation needed',
          'Desktop notifications for new messages and incoming calls, even when the tab is in the background',
        ],
      },
      {
        id: 'desktop',
        icon: '🖥️',
        title: 'Mac & PC',
        description: 'A full-size layout for bigger screens.',
        items: [
          'Your chat list and conversation side by side',
          'Keyboard-friendly: press Enter to send, Shift + Enter for a new line',
          'Share your screen during calls',
        ],
      },
      {
        id: 'mobile',
        icon: '📱',
        title: 'Android & iPhone',
        description: 'Take your conversations with you.',
        items: [
          'Open Chatterly in your phone’s browser for a layout built for small screens',
          'Native apps for Android and iPhone are in development',
        ],
      },
      {
        id: 'reliability',
        icon: '⚡',
        title: 'Real time and reliable',
        description: 'Built to keep up with your conversations.',
        items: [
          'Messages and calls are delivered in real time',
          'If your connection drops, Chatterly tells you and reconnects automatically',
          'Messages you send while offline are queued and delivered once you are back',
          'Photos and videos are compressed before sending to save data',
        ],
      },
    ],
  },

  help: {
    documentTitle: 'Help Center',
    eyebrow: 'Help Center',
    title: 'How can we help?',
    intro: 'Guides and answers for getting started and getting the most out of Chatterly.',
    sections: [
      {
        id: 'getting-started',
        icon: '🚀',
        title: 'Getting started',
        description: 'From sign-in to your first message in a few steps.',
        steps: [
          'Sign in with your phone number, email address or Google account.',
          'Enter the one-time code we send you to verify it’s really you.',
          'Set up your profile: your name, date of birth and, if you like, a photo and bio. Email and Google accounts also add a phone number.',
          'Add a contact or open a chat, and start the conversation.',
        ],
      },
      {
        id: 'guides',
        icon: '📘',
        title: 'Guides',
        description: 'Quick how-tos for everyday tasks.',
        guides: [
          {
            title: 'Start a conversation',
            body: 'Select the add-contact button above your chat list, find the person by name or number, and open the chat.',
          },
          {
            title: 'Create a group',
            body: 'Go to Groups and choose Create New Group. Name the group, add participants and create it — you become its admin.',
          },
          {
            title: 'Make a call',
            body: 'Open a chat and use the call buttons in the header for a voice or video call. From the Calls tab you can also dial a name or number.',
          },
          {
            title: 'Send a voice message',
            body: 'Hold the microphone button in the message bar to record. Slide left to cancel, or release to send.',
          },
          {
            title: 'Turn on two-step verification',
            body: 'Open Settings, then Privacy, and choose Two-Step Verification to protect your account with an SMS code or an authenticator app.',
          },
          {
            title: 'Change the theme or wallpaper',
            body: 'Open Settings, then Appearance, to switch between light, dark and system themes or pick a chat wallpaper.',
          },
        ],
      },
      {
        id: 'faqs',
        icon: '❓',
        title: 'Frequently asked questions',
        description: 'Answers to the questions we hear most.',
        faqs: [
          {
            question: 'Do I need to install anything?',
            answer: 'No. Chatterly runs in your browser — sign in and start chatting.',
          },
          {
            question: 'Why am I asked for a phone number?',
            answer: 'Accounts created with an email address or Google add a phone number during profile setup, so friends can find you and your account can be protected with two-step verification.',
          },
          {
            question: 'How do I block someone?',
            answer: 'Open the chat, open the menu in the chat header and choose Block. Blocked contacts can no longer message or call you.',
          },
          {
            question: 'Can I remove a call from my history?',
            answer: 'Yes. In the Calls tab, open the menu next to a call and choose Delete.',
          },
          {
            question: 'Why was I signed out?',
            answer: 'For your security, Chatterly signs you out after a period of inactivity. Sign in again to pick up where you left off.',
          },
          {
            question: 'How do I get notified about new messages?',
            answer: 'Allow notifications when your browser asks. You can fine-tune sounds and message previews in Settings, under Notification.',
          },
        ],
      },
      {
        id: 'support',
        icon: '🛟',
        title: 'Support',
        description: 'Still need help? We’re here.',
        items: [
          'Signed in? Open Settings, then Help & Feedback, to report a problem or send us feedback.',
          'Can’t sign in? Check that you’re using the same phone number, email or Google account you signed up with, then request a new code.',
        ],
      },
    ],
  },

  blog: {
    documentTitle: 'Blog',
    eyebrow: 'Blog',
    title: 'What’s new in Chatterly',
    intro: 'Product updates, tips and the thinking behind the features you use every day.',
    posts: [
      {
        id: 'group-calls',
        category: 'Product update',
        title: 'Group voice and video calls are here',
        paragraphs: [
          'You can now start a voice or video call with an entire group, right from the group chat. Everyone in the group is invited, and members can join while the call is in progress.',
          'Group admins can end a call for everyone, and a short summary is added to the chat when the call finishes.',
        ],
      },
      {
        id: 'screen-sharing',
        category: 'Product update',
        title: 'Share your screen during a call',
        paragraphs: [
          'Walk someone through a document, a design or a bug without leaving the call. Start sharing from the call controls and choose a window, a tab or your whole screen.',
          'Screen sharing works in both voice and video calls, so you can switch to it whenever the conversation needs it.',
        ],
      },
      {
        id: 'two-step-verification',
        category: 'Security',
        title: 'Protect your account with two-step verification',
        paragraphs: [
          'Two-step verification adds a second check when you sign in on a new device: a code sent by SMS, or one from your authenticator app.',
          'Turn it on in Settings under Privacy. You can also review the devices signed in to your account and sign out any you don’t recognise.',
        ],
      },
      {
        id: 'personalization',
        category: 'Tips',
        title: 'Dark mode, wallpapers and more ways to make Chatterly yours',
        paragraphs: [
          'Prefer a darker screen in the evening? Choose light, dark or follow your system setting in Settings under Appearance.',
          'While you’re there, pick a chat wallpaper, and head to Notification to choose your sounds and whether message previews appear.',
        ],
      },
      {
        id: 'disappearing-messages',
        category: 'Privacy',
        title: 'Messages that disappear on a timer',
        paragraphs: [
          'Some conversations don’t need to stick around. Turn on disappearing messages for a chat and new messages are removed after the time you choose.',
          'You can set a default timer for new chats too, so every conversation starts the way you prefer.',
        ],
      },
    ],
  },
});

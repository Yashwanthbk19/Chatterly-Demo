export const UI_LANGUAGE_STORAGE_KEY = 'chatterly_ui_language';
export const UI_LANGUAGE_CHANGED_EVENT = 'chatterly-ui-language-changed';

const DEFAULT_LANGUAGE = 'English (India)';
const listeners = new Set();

const HINDI_TRANSLATIONS = Object.freeze({
  Settings: 'सेटिंग्स',
  'Search settings': 'सेटिंग्स खोजें',
  Profile: 'प्रोफ़ाइल',
  Appearance: 'दिखावट',
  Notification: 'सूचनाएँ',
  Privacy: 'गोपनीयता',
  'Media & Links': 'मीडिया और लिंक',
  Devices: 'डिवाइस',
  'Help & Feedback': 'सहायता और प्रतिक्रिया',
  Logout: 'लॉग आउट',
  'Sign out of your Chatterly account': 'अपने Chatterly खाते से साइन आउट करें',
  'App Version:': 'ऐप संस्करण:',
  'Find your settings here': 'अपनी सेटिंग्स यहाँ खोजें',
  'Use the sidebar to manage your Chatterly preferences': 'Chatterly प्राथमिकताएँ प्रबंधित करने के लिए साइडबार का उपयोग करें',
  'Manage your profile details, name, bio, and account information': 'अपनी प्रोफ़ाइल, नाम, परिचय और खाते की जानकारी प्रबंधित करें',
  'Customize themes, colors, fonts, and chat appearance': 'थीम, रंग, फ़ॉन्ट और चैट की दिखावट बदलें',
  'Control message alerts, sounds, badges, and reminders': 'संदेश अलर्ट, ध्वनि, बैज और रिमाइंडर नियंत्रित करें',
  'Manage your privacy preferences and account protection': 'अपनी गोपनीयता प्राथमिकताएँ और खाता सुरक्षा प्रबंधित करें',
  'Review shared media, downloads, and storage usage': 'साझा मीडिया, डाउनलोड और स्टोरेज उपयोग देखें',
  'View active sessions and manage signed-in devices': 'सक्रिय सत्र देखें और साइन-इन डिवाइस प्रबंधित करें',
  'Get support, report issues, and send feedback': 'सहायता पाएँ, समस्याएँ रिपोर्ट करें और प्रतिक्रिया भेजें',
  'Manage your profile information and how others see you': 'अपनी प्रोफ़ाइल जानकारी और दूसरों को दिखाई देने वाली जानकारी प्रबंधित करें',
  'Edit Profile': 'प्रोफ़ाइल संपादित करें',
  'Account Information': 'खाते की जानकारी',
  'Manage your contact details and login information': 'अपने संपर्क और लॉगिन की जानकारी प्रबंधित करें',
  Email: 'ईमेल',
  'Phone Number': 'फ़ोन नंबर',
  'Date of Birth': 'जन्म तिथि',
  Language: 'भाषा',
  'Time Zone': 'समय क्षेत्र',
  'Used for account access, verification, and important updates.': 'खाते की पहुँच, सत्यापन और महत्वपूर्ण अपडेट के लिए उपयोग होता है।',
  'Used for account verification and security.': 'खाता सत्यापन और सुरक्षा के लिए उपयोग होता है।',
  'Used to confirm your age and provide age-appropriate features.': 'आपकी आयु की पुष्टि और आयु के अनुरूप सुविधाओं के लिए उपयोग होता है।',
  'Choose the language used across Chatterly.': 'Chatterly में उपयोग की जाने वाली भाषा चुनें।',
  'Set your time zone for accurate message times and activity information.': 'सही संदेश समय और गतिविधि जानकारी के लिए अपना समय क्षेत्र चुनें।',
  'English (India)': 'अंग्रेज़ी (भारत)',
  'English (US)': 'अंग्रेज़ी (अमेरिका)',
  Hindi: 'हिन्दी',
  'Add your name': 'अपना नाम जोड़ें',
  'Add a short bio': 'संक्षिप्त परिचय जोड़ें',
  'Not set': 'सेट नहीं है',
  Save: 'सहेजें',
  Cancel: 'रद्द करें',
  'Profile updated successfully': 'प्रोफ़ाइल सफलतापूर्वक अपडेट हुई',
  'Change phone number?': 'फ़ोन नंबर बदलें?',
  'Your new phone number must be verified with a one-time SMS code.': 'आपके नए फ़ोन नंबर को एक बार के SMS कोड से सत्यापित करना होगा।',
  'Enter new phone number': 'नया फ़ोन नंबर दर्ज करें',
  'Enter a valid Indian mobile number. We will send a 6-digit OTP.': 'मान्य भारतीय मोबाइल नंबर दर्ज करें। हम 6 अंकों का OTP भेजेंगे।',
  'Verify phone number': 'फ़ोन नंबर सत्यापित करें',
  'Enter the 6-digit OTP sent to': 'इस नंबर पर भेजा गया 6 अंकों का OTP दर्ज करें:',
  'Current phone number': 'वर्तमान फ़ोन नंबर',
  'New phone number': 'नया फ़ोन नंबर',
  'One-time password': 'वन-टाइम पासवर्ड',
  'Resend OTP in': 'OTP दोबारा भेजें:',
  'Resend OTP': 'OTP दोबारा भेजें',
  Back: 'वापस',
  Close: 'बंद करें',
  Continue: 'जारी रखें',
  'Send OTP': 'OTP भेजें',
  'Sending...': 'भेजा जा रहा है...',
  'Verifying...': 'सत्यापन हो रहा है...',
  'Verify & Update': 'सत्यापित करें और अपडेट करें',
  'Phone number updated successfully': 'फ़ोन नंबर सफलतापूर्वक अपडेट हुआ',
  'Loading profile...': 'प्रोफ़ाइल लोड हो रही है...',
  'Update your profile photo, display name, and bio.': 'अपनी प्रोफ़ाइल फ़ोटो, प्रदर्शन नाम और परिचय अपडेट करें।',
  'Profile photo': 'प्रोफ़ाइल फ़ोटो',
  'Change Photo': 'फ़ोटो बदलें',
  'Add Photo': 'फ़ोटो जोड़ें',
  Remove: 'हटाएँ',
  'Display Name': 'प्रदर्शन नाम',
  'Display name': 'प्रदर्शन नाम',
  Bio: 'परिचय',
  'Tell people about yourself': 'लोगों को अपने बारे में बताएँ',
  'Saving...': 'सहेजा जा रहा है...',
  'Save Changes': 'बदलाव सहेजें',
  'Search anything in chatterly': 'Chatterly में कुछ भी खोजें',
  Chats: 'चैट',
  Contacts: 'संपर्क',
  Calls: 'कॉल',
  All: 'सभी',
  Unread: 'अपठित',
  Groups: 'समूह',
  Pinned: 'पिन किए गए',
  Broadcast: 'प्रसारण',
  Broadcasts: 'प्रसारण',
  Pins: 'पिन',
  'Create group': 'समूह बनाएँ',
  'Create broadcast': 'प्रसारण बनाएँ',
  'Create Group': 'समूह बनाएँ',
  'Create Broadcast': 'प्रसारण बनाएँ',
  'Invite Friends': 'दोस्तों को आमंत्रित करें',
  'Blocked Contacts': 'ब्लॉक किए गए संपर्क',
  Refresh: 'रीफ़्रेश करें',
  'Delete Chat': 'चैट हटाएँ',
  'Add Contact': 'संपर्क जोड़ें',
  'More options': 'अधिक विकल्प',
  'No messages': 'कोई संदेश नहीं',
  'No messages yet': 'अभी कोई संदेश नहीं',
  'No messages yet.': 'अभी कोई संदेश नहीं।',
  'No messages yet. Start the conversation.': 'अभी कोई संदेश नहीं। बातचीत शुरू करें।',
  'No contacts found': 'कोई संपर्क नहीं मिला',
  'Try a different name or number.': 'कोई दूसरा नाम या नंबर आज़माएँ।',
  'View all Contacts': 'सभी संपर्क देखें',
  'Type a name or number to call': 'कॉल करने के लिए नाम या नंबर लिखें',
  'Your profile': 'आपकी प्रोफ़ाइल',
  'No phone number': 'फ़ोन नंबर उपलब्ध नहीं',
  'No email': 'ईमेल उपलब्ध नहीं',
  'Mute Notifications': 'सूचनाएँ म्यूट करें',
  'Unmute Notifications': 'सूचनाएँ अनम्यूट करें',
  'Dark mode': 'डार्क मोड',
  'Help & Support': 'सहायता और समर्थन',
  On: 'चालू',
  Off: 'बंद',
  Messages: 'संदेश',
  'Choose how you\'re notified about messages,': 'संदेशों की सूचना पाने का तरीका चुनें,',
  'groups, and calls.': 'समूहों और कॉल के लिए।',
  'Manage notifications for new messages.': 'नए संदेशों की सूचनाएँ प्रबंधित करें।',
  'Manage notifications for group messages and activity.': 'समूह संदेशों और गतिविधि की सूचनाएँ प्रबंधित करें।',
  'Manage notifications for incoming calls.': 'आने वाली कॉल की सूचनाएँ प्रबंधित करें।',
  'Popup preview': 'पॉपअप पूर्वावलोकन',
  'Show popup preview for incoming notifications.': 'आने वाली सूचनाओं का पॉपअप पूर्वावलोकन दिखाएँ।',
  Vibration: 'कंपन',
  'Vibrate this device when a new notification arrives.': 'नई सूचना आने पर इस डिवाइस में कंपन करें।',
  'Call Connected': 'कॉल कनेक्ट हो गई',
  'On Hold': 'होल्ड पर',
  'Call is end-to-end encrypted': 'कॉल एंड-टू-एंड एन्क्रिप्टेड है',
  'Encrypted Call': 'एन्क्रिप्टेड कॉल',
  Theme: 'थीम',
  'System Default': 'सिस्टम डिफ़ॉल्ट',
  'Light Mode': 'लाइट मोड',
  'Dark Mode': 'डार्क मोड',
  System: 'सिस्टम',
  Auto: 'स्वचालित',
  Wallpaper: 'वॉलपेपर',
  'Chat Wallpaper': 'चैट वॉलपेपर',
  'Side bar': 'साइडबार',
  Preview: 'पूर्वावलोकन',
  'Customize how Chatterly looks and feels across the app.': 'पूरे ऐप में Chatterly की दिखावट को अनुकूलित करें।',
  'Choose your preferred appearance for Chatterly': 'Chatterly के लिए अपनी पसंदीदा दिखावट चुनें',
  'Choose the default background for your conversations': 'अपनी बातचीत के लिए डिफ़ॉल्ट पृष्ठभूमि चुनें',
  'Choose whether to show labels for the side bar': 'साइडबार में लेबल दिखाने हैं या नहीं, चुनें',
  'Labels Turned On': 'लेबल चालू हैं',
  'Labels Turned Off': 'लेबल बंद हैं',
  'See how your chats look in each theme. Select one to apply it instantly.': 'देखें कि हर थीम में आपकी चैट कैसी दिखती है। तुरंत लागू करने के लिए एक चुनें।',
  'App Version': 'ऐप संस्करण',
  'The Chatterly build currently running on this device.': 'इस डिवाइस पर वर्तमान में चल रहा Chatterly बिल्ड।',
  'Privacy & Security': 'गोपनीयता और सुरक्षा',
  'Privacy and Security': 'गोपनीयता और सुरक्षा',
  'Protect your account, conversations, and personal data with advanced privacy controls.': 'उन्नत गोपनीयता नियंत्रणों से अपने खाते, बातचीत और निजी डेटा की सुरक्षा करें।',
  'End to End Encryption': 'एंड-टू-एंड एन्क्रिप्शन',
  'Your personal chats and calls are protected with end-to-end encryption.': 'आपकी निजी चैट और कॉल एंड-टू-एंड एन्क्रिप्शन से सुरक्षित हैं।',
  Enabled: 'सक्रिय',
  Disabled: 'निष्क्रिय',
  '2-Step Verification': '2-चरणीय सत्यापन',
  'Add an extra layer of security by requiring a verification code when signing in.': 'साइन इन करते समय सत्यापन कोड की आवश्यकता रखकर अतिरिक्त सुरक्षा जोड़ें।',
  'Blocked Users': 'ब्लॉक किए गए उपयोगकर्ता',
  "View and manage people you've blocked from contacting you.": 'उन लोगों को देखें और प्रबंधित करें जिन्हें आपने संपर्क करने से ब्लॉक किया है।',
  Contact: 'संपर्क',
  'Disappearing Messages': 'गायब होने वाले संदेश',
  'Automatically delete new messages after a selected period of time.': 'चुनी गई अवधि के बाद नए संदेश अपने आप हटाएँ।',
  'Report a User': 'उपयोगकर्ता की रिपोर्ट करें',
  'Report spam, abuse, or inappropriate behavior to help keep the community safe.': 'समुदाय को सुरक्षित रखने के लिए स्पैम, दुर्व्यवहार या अनुचित व्यवहार की रिपोर्ट करें।',
  'Submit Report': 'रिपोर्ट भेजें',
  'Manage how media is downloaded, uploaded, and stored in Chatterly.': 'Chatterly में मीडिया डाउनलोड, अपलोड और संग्रहीत होने का तरीका प्रबंधित करें।',
  'Media Upload quality': 'मीडिया अपलोड गुणवत्ता',
  'Choose the quality of photos and videos when sending them.': 'फ़ोटो और वीडियो भेजते समय उनकी गुणवत्ता चुनें।',
  'Media Auto-download': 'मीडिया स्वतः डाउनलोड',
  'Control when photos, videos, and other media download automatically.': 'फ़ोटो, वीडियो और अन्य मीडिया कब अपने आप डाउनलोड हों, इसे नियंत्रित करें।',
  'Storage Used': 'उपयोग किया गया स्टोरेज',
  'See how much space Chatterly is using on this device.': 'देखें कि इस डिवाइस पर Chatterly कितनी जगह उपयोग कर रहा है।',
  'Clear Cache': 'कैश साफ़ करें',
  'Free up space by clearing temporary cached files. Your chats and settings stay safe.': 'अस्थायी कैश फ़ाइलें साफ़ करके जगह खाली करें। आपकी चैट और सेटिंग्स सुरक्षित रहेंगी।',
  'Clearing…': 'साफ़ किया जा रहा है…',
  Cleared: 'साफ़ हो गया',
  Add: 'जोड़ें',
  Mute: 'म्यूट करें',
  Unmute: 'अनम्यूट करें',
  Speaker: 'स्पीकर',
  Hold: 'होल्ड',
  'Screen Share': 'स्क्रीन साझा करें',
  Chat: 'चैट',
  'End call': 'कॉल समाप्त करें',
});

export const normalizeUiLanguage = (language) =>
  String(language || '').trim().toLowerCase().startsWith('hindi') ||
  String(language || '').trim().toLowerCase().startsWith('हिन्दी') ||
  String(language || '').trim().toLowerCase().startsWith('हिंदी')
    ? 'Hindi'
    : String(language || '').trim() || DEFAULT_LANGUAGE;

const readProfileLanguage = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.language || user?.raw?.language || '';
  } catch {
    return '';
  }
};

export const readStoredUiLanguage = () => {
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE;
  return normalizeUiLanguage(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) || readProfileLanguage());
};

let activeLanguage = readStoredUiLanguage();

const applyDocumentLanguage = (language) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'Hindi' ? 'hi' : 'en';
  }
};

applyDocumentLanguage(activeLanguage);

export const getUiLanguage = () => activeLanguage;

export const setUiLanguage = (language) => {
  const nextLanguage = normalizeUiLanguage(language);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
  }
  applyDocumentLanguage(nextLanguage);
  if (nextLanguage === activeLanguage) return;
  activeLanguage = nextLanguage;
  listeners.forEach((listener) => listener());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UI_LANGUAGE_CHANGED_EVENT, { detail: { language: nextLanguage } }));
  }
};

export const subscribeToUiLanguage = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const translateUiText = (text, language = activeLanguage) => {
  if (normalizeUiLanguage(language) !== 'Hindi') return text;
  return HINDI_TRANSLATIONS[text] || text;
};

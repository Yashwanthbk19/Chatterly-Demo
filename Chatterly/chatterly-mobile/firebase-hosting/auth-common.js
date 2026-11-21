/* global firebase */
/* eslint-disable no-unused-vars */

const firebaseConfig = {
  apiKey: 'AIzaSyDJlrzgpLLZ46c_3bcKcsHPw_hfL_e6ivQ',
  authDomain: 'stackly-chatterly.firebaseapp.com',
  projectId: 'stackly-chatterly',
  storageBucket: 'stackly-chatterly.firebasestorage.app',
  messagingSenderId: '899974576436',
  appId: '1:899974576436:web:d9bfeee4332f00e2184d61',
};

firebase.initializeApp(firebaseConfig);

const request = new URLSearchParams(window.location.search);
const returnUrl = request.get('return_url') || '';
const state = request.get('state') || '';

function validReturnUrl(value) {
  return /^(exp|chatterly):\/\//i.test(value) || /^https?:\/\/localhost(?::\d+)?\//i.test(value);
}

function finish(values) {
  if (!state || !validReturnUrl(returnUrl)) {
    showError('The app callback is missing or invalid. Close this page and try again.');
    return;
  }
  const fragment = new URLSearchParams({...values, state}).toString();
  window.location.replace(`${returnUrl}#${fragment}`);
}

function showError(message) {
  const status = document.getElementById('status');
  if (status) { status.textContent = message; }
}

function errorValues(error) {
  return {
    error: String(error && error.code ? error.code : 'auth/unknown'),
    message: String(error && error.message ? error.message : 'Authentication failed.'),
  };
}

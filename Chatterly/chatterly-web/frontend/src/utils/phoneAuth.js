import { RecaptchaVerifier } from 'firebase/auth';

const PHONE_RECAPTCHA_ERROR_MESSAGE =
  'Unable to initialize phone verification. Please refresh and try again.';

export const clearPhoneRecaptchaVerifier = ({ containerId, preserveConfirmationResult = false } = {}) => {
  if (typeof window !== 'undefined') {
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (error) {
        console.warn('Unable to clear reCAPTCHA verifier cleanly:', error);
      }
    }

    window.recaptchaVerifier = null;

    if (!preserveConfirmationResult) {
      window.confirmationResult = null;
    }
  }

  if (containerId && typeof document !== 'undefined') {
    const container = document.getElementById(containerId);

    if (container) {
      container.innerHTML = '';
    }
  }
};

export const ensurePhoneRecaptchaVerifier = async ({ auth, containerId }) => {
  const container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;

  if (!container) {
    throw new Error(PHONE_RECAPTCHA_ERROR_MESSAGE);
  }

  clearPhoneRecaptchaVerifier({ containerId });

  const widgetContainer = document.createElement('div');
  widgetContainer.id = `${containerId}-widget-${Date.now()}`;
  container.appendChild(widgetContainer);

  const verifier = new RecaptchaVerifier(auth, widgetContainer, {
    size: 'invisible',
  });

  try {
    await verifier.render();
  } catch (error) {
    clearPhoneRecaptchaVerifier({ containerId });
    throw error;
  }

  if (typeof window !== 'undefined') {
    window.recaptchaVerifier = verifier;
  }

  return verifier;
};

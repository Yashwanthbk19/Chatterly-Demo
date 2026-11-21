const normalizePhone = (phone) => {

  if (!phone) return "";

  // Remove spaces and dashes
  phone = phone.replace(/[\s-]/g, "");

  // Add +91 if missing
  if (!phone.startsWith("+91")) {

    // remove leading 0
    if (phone.startsWith("0")) {
      phone = phone.substring(1);
    }

    phone = `+91${phone}`;
  }

  return phone;
};

export default normalizePhone;
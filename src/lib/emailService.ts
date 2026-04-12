import emailjs from '@emailjs/browser';

// These should be set in your .env file
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_placeholder';
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'public_key_placeholder';

/**
 * Sends a notification email when a new pharmacy registers.
 * Target: Super Admin
 */
export const sendNewPharmacyAlert = async (pharmacyName: string, pharmacyEmail: string) => {
  const templateParams = {
    to_name: 'Super Admin',
    subject: 'New Pharmacy Registration Alert',
    message: `A new pharmacy "${pharmacyName}" (${pharmacyEmail}) has just registered on PharmConnect Zim and is awaiting verification via the dashboard.`,
  };

  try {
    const response = await emailjs.send(
      SERVICE_ID,
      import.meta.env.VITE_EMAILJS_TEMPLATE_REG || 'template_new_pharmacy',
      templateParams,
      PUBLIC_KEY
    );
    return response;
  } catch (error) {
    console.error('EmailJS Error:', error);
    throw error;
  }
};

/**
 * Sends a notification email when a new staff member is added to a pharmacy.
 * Target: Pharmacy Admin
 */
export const sendNewStaffAlert = async (adminEmail: string, staffName: string, pharmacyName: string) => {
  const templateParams = {
    to_email: adminEmail,
    subject: 'New Staff Member Added',
    message: `A new staff member, ${staffName}, has been successfully added to your pharmacy team at ${pharmacyName}.`,
  };

  try {
    const response = await emailjs.send(
      SERVICE_ID,
      import.meta.env.VITE_EMAILJS_TEMPLATE_STAFF || 'template_new_staff',
      templateParams,
      PUBLIC_KEY
    );
    return response;
  } catch (error) {
    console.error('EmailJS Error:', error);
    throw error;
  }
};

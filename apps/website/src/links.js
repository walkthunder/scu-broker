export const customerUrl = import.meta.env.VITE_CUSTOMER_URL || 'http://localhost:5173';
export const partnerUrl = import.meta.env.VITE_PARTNER_URL || 'http://localhost:5175/partner/';

export const customerLogin = `${customerUrl.replace(/\/$/, '')}/login`;

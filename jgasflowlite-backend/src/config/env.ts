import 'dotenv/config';

/** Everything environment-shaped comes from .env (see .env.example). */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const ENV = {
  port: Number(process.env.PORT) || 5000,
  timezone: process.env.APP_TIMEZONE || 'Asia/Karachi',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jgasflow',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 20,
  },
  tokenSecret: process.env.TOKEN_SECRET || 'dev-only-token-secret-change-me',
  sessionDays: Number(process.env.SESSION_DAYS) || 60,
  trialDays: Number(process.env.TRIAL_DAYS) || 14,
  payTo: {
    jazzcash: process.env.PAY_JAZZCASH || '',
    easypaisa: process.env.PAY_EASYPAISA || '',
    bank: process.env.PAY_BANK || '',
    whatsapp: process.env.PAY_WHATSAPP || '',
  },
};

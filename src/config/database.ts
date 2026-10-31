import { Sequelize } from 'sequelize';

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const sequelize = new Sequelize(
  required('DB_NAME', 'yolo_project'),
  required('DB_USER', 'yolo_user'),
  required('DB_PASSWORD', 'local_dev_password'),
  {
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(required('DB_PORT', '5432')),
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: { max: 5, min: 0, acquire: 30_000, idle: 10_000 },
  },
);

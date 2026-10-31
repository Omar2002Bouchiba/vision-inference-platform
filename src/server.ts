import 'dotenv/config';
import express from 'express';
import { sequelize } from './config/database';
import { initializeModels } from './models';
import authRoutes from './routes/auth';
import datasetRoutes from './routes/datasets';
import creditRoutes from './routes/credits';
import assetRoutes from './routes/assets';
import inferenceRoutes from './routes/inferences';
import { errorHandler } from './middleware/http';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '1mb' }));
app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'vision-inference-api' });
});
app.use('/auth', authRoutes);
app.use('/datasets', datasetRoutes);
app.use('/credits', creditRoutes);
app.use('/datasets', assetRoutes);
app.use('/', inferenceRoutes);
app.use((_request, response) => response.status(404).json({ error: 'Route not found.' }));
app.use(errorHandler);

async function start(): Promise<void> {
  initializeModels(sequelize);
  await sequelize.authenticate();
  if (process.env.DB_SYNC === 'true') await sequelize.sync();
  app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port}`));
}

start().catch((error: unknown) => {
  console.error('API startup failed:', error);
  process.exitCode = 1;
});

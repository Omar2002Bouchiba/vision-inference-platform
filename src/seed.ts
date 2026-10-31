import 'dotenv/config';
import { sequelize } from './config/database';
import { Dataset, initializeModels, User } from './models';
import { hashPassword } from './utils/password';

async function seed(): Promise<void> {
  initializeModels(sequelize);
  await sequelize.authenticate();
  await sequelize.sync();

  const userHash = await hashPassword(process.env.DEMO_USER_PASSWORD ?? 'DemoPass123!');
  const adminHash = await hashPassword(process.env.DEMO_ADMIN_PASSWORD ?? 'AdminPass123!');
  const [user] = await User.findOrCreate({
    where: { email: 'demo@example.com' },
    defaults: { email: 'demo@example.com', passwordHash: userHash, role: 'user', creditBalance: 100 },
  });
  const [admin] = await User.findOrCreate({
    where: { email: 'admin@example.com' },
    defaults: { email: 'admin@example.com', passwordHash: adminHash, role: 'admin', creditBalance: 100 },
  });

  const demoDatasets = [
    { name: 'Street objects', tags: ['street', 'cars', 'people'] },
    { name: 'Indoor objects', tags: ['indoor', 'furniture'] },
    { name: 'Sports footage', tags: ['sports', 'video'] },
  ];

  for (const item of demoDatasets) {
    await Dataset.findOrCreate({
      where: { ownerId: user.id, name: item.name },
      defaults: { ownerId: user.id, name: item.name, tags: item.tags },
    });
  }
  console.log('Seed complete: 2 demo users and 3 datasets.');
}

seed()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });

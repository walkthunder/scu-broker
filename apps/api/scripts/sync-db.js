import { sequelize } from '../src/config/database.js';
import '../src/models/index.js';

await sequelize.authenticate();
await sequelize.sync({ alter: true });
console.log('DB synced.');
process.exit(0);

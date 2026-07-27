import { Sequelize } from 'sequelize';
import { config } from '../config/index.js';

export const sequelize = new Sequelize(
  config.db.name,
  config.db.user,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    logging: config.nodeEnv === 'development' ? console.log : false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
);

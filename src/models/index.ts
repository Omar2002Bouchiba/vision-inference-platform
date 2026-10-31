import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string;
  declare role: CreationOptional<'user' | 'admin'>;
  declare creditBalance: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Dataset extends Model<InferAttributes<Dataset>, InferCreationAttributes<Dataset>> {
  declare id: CreationOptional<string>;
  declare ownerId: string;
  declare name: string;
  declare tags: CreationOptional<string[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

export class MediaAsset extends Model<InferAttributes<MediaAsset>, InferCreationAttributes<MediaAsset>> {
  declare id: CreationOptional<string>;
  declare datasetId: string;
  declare kind: 'image' | 'video';
  declare storagePath: string;
  declare originalName: string;
  declare mimeType: string;
  declare sizeBytes: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type InferenceStatus = 'PENDING' | 'RUNNING' | 'FAILED' | 'ABORTED' | 'COMPLETED';

export class InferenceJob extends Model<InferAttributes<InferenceJob>, InferCreationAttributes<InferenceJob>> {
  declare id: CreationOptional<string>;
  declare ownerId: string;
  declare datasetId: string;
  declare modelId: string;
  declare status: CreationOptional<InferenceStatus>;
  declare progress: CreationOptional<number>;
  declare estimatedCost: number;
  declare result: CreationOptional<Record<string, unknown> | null>;
  declare errorType: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class CreditTransaction extends Model<InferAttributes<CreditTransaction>, InferCreationAttributes<CreditTransaction>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare kind: 'UPLOAD' | 'INFERENCE' | 'ADMIN_TOP_UP' | 'REFUND';
  declare amount: number;
  declare referenceId: CreationOptional<string | null>;
  declare description: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initializeModels(sequelize: Sequelize): void {
  User.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING(200), allowNull: false, field: 'password_hash' },
    role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
    creditBalance: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0, field: 'credit_balance' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'users' });

  // Paranoid deletion hides a dataset while the partial index allows its name to be reused afterward.
  Dataset.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
    name: { type: DataTypes.STRING(120), allowNull: false },
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' },
  }, { sequelize, tableName: 'datasets', paranoid: true, indexes: [{ unique: true, fields: ['owner_id', 'name'], where: { deleted_at: null } }] });

  MediaAsset.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    datasetId: { type: DataTypes.UUID, allowNull: false, field: 'dataset_id' },
    kind: { type: DataTypes.ENUM('image', 'video'), allowNull: false },
    storagePath: { type: DataTypes.STRING(1024), allowNull: false, field: 'storage_path' },
    originalName: { type: DataTypes.STRING(255), allowNull: false, field: 'original_name' },
    mimeType: { type: DataTypes.STRING(100), allowNull: false, field: 'mime_type' },
    sizeBytes: { type: DataTypes.BIGINT, allowNull: false, field: 'size_bytes' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'media_assets' });

  InferenceJob.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
    datasetId: { type: DataTypes.UUID, allowNull: false, field: 'dataset_id' },
    modelId: { type: DataTypes.STRING(80), allowNull: false, field: 'model_id' },
    status: { type: DataTypes.ENUM('PENDING', 'RUNNING', 'FAILED', 'ABORTED', 'COMPLETED'), allowNull: false, defaultValue: 'PENDING' },
    progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    estimatedCost: { type: DataTypes.DECIMAL(14, 4), allowNull: false, field: 'estimated_cost' },
    result: { type: DataTypes.JSONB, allowNull: true },
    errorType: { type: DataTypes.STRING(120), allowNull: true, field: 'error_type' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'inference_jobs' });

  CreditTransaction.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    kind: { type: DataTypes.ENUM('UPLOAD', 'INFERENCE', 'ADMIN_TOP_UP', 'REFUND'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    referenceId: { type: DataTypes.UUID, allowNull: true, field: 'reference_id' },
    description: { type: DataTypes.STRING(500), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  }, { sequelize, tableName: 'credit_transactions' });

  User.hasMany(Dataset, { foreignKey: 'ownerId', as: 'datasets' });
  Dataset.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
  Dataset.hasMany(MediaAsset, { foreignKey: 'datasetId', as: 'assets' });
  MediaAsset.belongsTo(Dataset, { foreignKey: 'datasetId', as: 'dataset' });
  Dataset.hasMany(InferenceJob, { foreignKey: 'datasetId', as: 'inferenceJobs' });
  InferenceJob.belongsTo(Dataset, { foreignKey: 'datasetId', as: 'dataset' });
  User.hasMany(InferenceJob, { foreignKey: 'ownerId', as: 'inferenceJobs' });
  InferenceJob.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
  User.hasMany(CreditTransaction, { foreignKey: 'userId', as: 'creditTransactions' });
  CreditTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}

/**
 * `@internal/storage`'s authoring surface (S5): the S3-compatible
 * object-storage contract. The storage service node, the `storage()` module,
 * and the runtime entrypoint land in later dispatches (D2-D4).
 */
export type { S3Config, S3Contract } from './contract.ts';
export { s3, s3Contract } from './contract.ts';

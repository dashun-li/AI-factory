import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageConfig {
  endPoint: string;
  port?: number;
  accessKey: string;
  secretKey: string;
  bucket?: string;
  useSSL?: boolean;
  /** Public base URL for generating absolute URLs (e.g. https://cdn.example.com). If set, URLs are prefixed with this instead of the MinIO endPoint. */
  publicBaseUrl?: string;
  /** Default expiry (seconds) for presigned URLs. */
  defaultPresignExpiry?: number;
  /** When true, upload methods automatically generate a presigned URL instead of a relative path. */
  usePresignedUrls?: boolean;
}

export interface UploadResult {
  objectName: string;
  /** Absolute URL if publicBaseUrl/usePresignedUrls configured, otherwise relative /<bucket>/<objectName>. */
  url: string;
  size: number;
}

export class StorageSDK {
  private client: Minio.Client;
  private bucket: string;
  private publicBaseUrl?: string;
  private defaultPresignExpiry: number;
  private usePresignedUrls: boolean;

  constructor(config: StorageConfig) {
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port ?? 9000,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSSL ?? false,
    });
    this.bucket = config.bucket ?? 'ai-video-factory';
    this.publicBaseUrl = config.publicBaseUrl;
    this.defaultPresignExpiry = config.defaultPresignExpiry ?? 3600;
    this.usePresignedUrls = config.usePresignedUrls ?? false;
  }

  /**
   * Build a public/absolute URL for an object using the configured strategy:
   * 1. publicBaseUrl (CDN) → `${publicBaseUrl}/${objectName}`
   * 2. MinIO endpoint (constructed from config)
   * 3. Relative path `/${bucket}/${objectName}` (fallback)
   */
  buildPublicUrl(objectName: string): string {
    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.replace(/\/+$/, '');
      return `${base}/${objectName}`;
    }
    return `/${this.bucket}/${objectName}`;
  }

  /**
   * Generate a presigned URL for downloading an object.
   * Falls back to buildPublicUrl if presigning is unavailable.
   */
  async getAccessibleUrl(objectName: string, expirySeconds?: number): Promise<string> {
    try {
      return await this.client.presignedGetObject(
        this.bucket,
        objectName,
        expirySeconds ?? this.defaultPresignExpiry,
      );
    } catch {
      return this.buildPublicUrl(objectName);
    }
  }

  async initBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async uploadFile(
    filePath: string,
    objectName?: string,
    contentType?: string,
  ): Promise<UploadResult> {
    const name = objectName ?? this.generateObjectName(filePath);
    const stats = fs.statSync(filePath);

    await this.client.fPutObject(
      this.bucket,
      name,
      filePath,
      contentType ? { 'Content-Type': contentType } : undefined,
    );

    return {
      objectName: name,
      url: this.usePresignedUrls
        ? await this.getAccessibleUrl(name)
        : this.buildPublicUrl(name),
      size: stats.size,
    };
  }

  async uploadBuffer(
    buffer: Buffer,
    objectName: string,
    contentType?: string,
  ): Promise<UploadResult> {
    await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      contentType ? { 'Content-Type': contentType } : undefined,
    );

    return {
      objectName,
      url: this.usePresignedUrls
        ? await this.getAccessibleUrl(objectName)
        : this.buildPublicUrl(objectName),
      size: buffer.length,
    };
  }

  async downloadToFile(objectName: string, filePath: string): Promise<void> {
    await this.client.fGetObject(this.bucket, objectName, filePath);
  }

  async getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectName, expirySeconds);
  }

  async deleteObject(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectName);
  }

  async listObjects(prefix?: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const objects: string[] = [];
      const stream = this.client.listObjects(this.bucket, prefix, true);
      stream.on('data', (obj) => { if (obj.name) objects.push(obj.name); });
      stream.on('end', () => resolve(objects));
      stream.on('error', reject);
    });
  }

  private generateObjectName(filePath: string): string {
    const ext = path.extname(filePath);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `${date}/${id}${ext}`;
  }
}

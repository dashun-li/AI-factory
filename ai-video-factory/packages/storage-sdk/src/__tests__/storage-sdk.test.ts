import { StorageSDK } from '../storage-sdk';

const mockBucketExists = jest.fn().mockResolvedValue(true);
const mockMakeBucket = jest.fn().mockResolvedValue(undefined);
const mockFPutObject = jest.fn().mockResolvedValue(undefined);
const mockPutObject = jest.fn().mockResolvedValue(undefined);
const mockFGetObject = jest.fn().mockResolvedValue(undefined);
const mockPresignedGetObject = jest.fn().mockResolvedValue('http://localhost:9000/ai-video-factory/test.mp4');
const mockRemoveObject = jest.fn().mockResolvedValue(undefined);
const mockListObjects = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
    fPutObject: mockFPutObject,
    putObject: mockPutObject,
    fGetObject: mockFGetObject,
    presignedGetObject: mockPresignedGetObject,
    removeObject: mockRemoveObject,
    listObjects: mockListObjects,
  })),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  statSync: jest.fn().mockReturnValue({ size: 1024 }),
}));

describe('StorageSDK', () => {
  let sdk: StorageSDK;

  beforeEach(() => {
    jest.clearAllMocks();
    sdk = new StorageSDK({
      endPoint: 'localhost',
      port: 9000,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: 'test-bucket',
    });
  });

  describe('initBucket', () => {
    it('should skip creation if bucket already exists', async () => {
      mockBucketExists.mockResolvedValue(true);
      await sdk.initBucket();
      expect(mockMakeBucket).not.toHaveBeenCalled();
    });

    it('should create bucket if not exists', async () => {
      mockBucketExists.mockResolvedValue(false);
      await sdk.initBucket();
      expect(mockMakeBucket).toHaveBeenCalledWith('test-bucket');
    });
  });

  describe('uploadFile', () => {
    it('should upload file and return UploadResult', async () => {
      const result = await sdk.uploadFile('/tmp/test.mp4', 'videos/test.mp4');

      expect(mockFPutObject).toHaveBeenCalledWith(
        'test-bucket',
        'videos/test.mp4',
        '/tmp/test.mp4',
        undefined,
      );
      expect(result.objectName).toBe('videos/test.mp4');
      expect(result.size).toBe(1024);
    });

    it('should auto-generate objectName when not provided', async () => {
      const result = await sdk.uploadFile('/tmp/audio.mp3');

      expect(mockFPutObject).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('.mp3'),
        '/tmp/audio.mp3',
        undefined,
      );
      expect(result.url).toContain('test-bucket');
    });

    it('should pass contentType metadata', async () => {
      await sdk.uploadFile('/tmp/test.mp4', 'vid.mp4', 'video/mp4');

      expect(mockFPutObject).toHaveBeenCalledWith(
        'test-bucket',
        'vid.mp4',
        '/tmp/test.mp4',
        { 'Content-Type': 'video/mp4' },
      );
    });
  });

  describe('uploadBuffer', () => {
    it('should upload buffer and return UploadResult', async () => {
      const buffer = Buffer.from('fake audio data');
      const result = await sdk.uploadBuffer(buffer, 'tts/test.wav', 'audio/wav');

      expect(mockPutObject).toHaveBeenCalledWith(
        'test-bucket',
        'tts/test.wav',
        buffer,
        buffer.length,
        { 'Content-Type': 'audio/wav' },
      );
      expect(result.objectName).toBe('tts/test.wav');
    });
  });

  describe('downloadToFile', () => {
    it('should download object to local file', async () => {
      await sdk.downloadToFile('videos/test.mp4', '/tmp/downloaded.mp4');
      expect(mockFGetObject).toHaveBeenCalledWith('test-bucket', 'videos/test.mp4', '/tmp/downloaded.mp4');
    });
  });

  describe('getPresignedUrl', () => {
    it('should return presigned URL with default expiry', async () => {
      const url = await sdk.getPresignedUrl('videos/test.mp4');
      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'videos/test.mp4', 3600);
      expect(url).toContain('test.mp4');
    });

    it('should use custom expiry', async () => {
      await sdk.getPresignedUrl('vid.mp4', 7200);
      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'vid.mp4', 7200);
    });
  });

  describe('deleteObject', () => {
    it('should remove object from bucket', async () => {
      await sdk.deleteObject('videos/old.mp4');
      expect(mockRemoveObject).toHaveBeenCalledWith('test-bucket', 'videos/old.mp4');
    });
  });

  describe('listObjects', () => {
    it('should list objects with optional prefix', async () => {
      const EventEmitter = require('events');
      const stream = new EventEmitter();
      (stream as any).on = stream.on.bind(stream);

      mockListObjects.mockReturnValue(stream);

      const promise = sdk.listObjects('videos/');

      // Simulate stream events
      process.nextTick(() => {
        stream.emit('data', { name: 'videos/a.mp4' });
        stream.emit('data', { name: 'videos/b.mp4' });
        stream.emit('end');
      });

      const objects = await promise;
      expect(objects).toEqual(['videos/a.mp4', 'videos/b.mp4']);
    });
  });

  describe('buildPublicUrl', () => {
    it('should return CDN URL when publicBaseUrl is set', () => {
      const cdnSdk = new StorageSDK({
        endPoint: 'localhost',
        accessKey: 'k',
        secretKey: 'k',
        publicBaseUrl: 'https://cdn.example.com/',
      });
      expect(cdnSdk.buildPublicUrl('videos/test.mp4')).toBe('https://cdn.example.com/videos/test.mp4');
    });

    it('should return relative URL when no publicBaseUrl', () => {
      expect(sdk.buildPublicUrl('videos/test.mp4')).toBe('/test-bucket/videos/test.mp4');
    });
  });

  describe('getAccessibleUrl', () => {
    it('should return presigned URL from minio client', async () => {
      const url = await sdk.getAccessibleUrl('videos/test.mp4');
      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'videos/test.mp4', 3600);
      expect(url).toContain('test.mp4');
    });

    it('should fall back to buildPublicUrl on presign error', async () => {
      mockPresignedGetObject.mockRejectedValueOnce(new Error('presign failed'));
      const url = await sdk.getAccessibleUrl('videos/test.mp4');
      expect(url).toBe('/test-bucket/videos/test.mp4');
    });

    it('should respect custom expiry', async () => {
      await sdk.getAccessibleUrl('videos/test.mp4', 7200);
      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'videos/test.mp4', 7200);
    });
  });

  describe('uploadFile with usePresignedUrls', () => {
    it('should return presigned URL when usePresignedUrls=true', async () => {
      const presignSdk = new StorageSDK({
        endPoint: 'localhost',
        accessKey: 'k',
        secretKey: 'k',
        usePresignedUrls: true,
      });
      const result = await presignSdk.uploadFile('/tmp/test.mp4', 'videos/test.mp4');
      expect(mockPresignedGetObject).toHaveBeenCalled();
      expect(result.url).toContain('test.mp4');
    });
  });
});

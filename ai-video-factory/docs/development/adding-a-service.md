# Adding a new service

This guide walks through adding a new domain service to the monorepo. Example: an `audio-service` that does voice cloning.

## 1. Scaffold

```bash
mkdir -p services/audio-service/src/__tests__
cd services/audio-service
```

Create `package.json`:

```json
{
  "name": "@ai-video-factory/audio-service",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "dev": "tsc --watch",
    "build": "tsc",
    "test": "jest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-video-factory/shared-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "@types/jest": "^29.5.0"
  }
}
```

Create `tsconfig.json` (mirror the other services):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Add the workspace dependency to the root `pnpm-workspace.yaml` if not already covered by `services/*`.

```bash
pnpm install
```

## 2. Implement

`src/index.ts`:

```ts
import { Transcript } from '@ai-video-factory/shared-types';

export interface AudioServiceConfig {
  modelEndpoint: string;
  apiKey?: string;
}

export interface CloneResult {
  audio_url: string;
  duration: number;
  voice_id: string;
}

export class AudioService {
  constructor(private readonly config: AudioServiceConfig) {}

  async clone(referenceAudio: string, text: string): Promise<CloneResult> {
    const res = await fetch(`${this.config.modelEndpoint}/clone`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey ?? ''}` },
      body: JSON.stringify({ reference_audio: referenceAudio, text }),
    });
    if (!res.ok) throw new Error(`Clone failed: ${res.status}`);
    return res.json();
  }
}
```

## 3. Tests

`src/__tests__/audio-service.test.ts`:

```ts
import { AudioService } from '../index';

describe('AudioService', () => {
  it('clones voice', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audio_url: 'x', duration: 1, voice_id: 'v1' }),
    });
    global.fetch = fetchMock as any;

    const svc = new AudioService({ modelEndpoint: 'http://x' });
    const result = await svc.clone('audio.wav', 'hello');
    expect(result.voice_id).toBe('v1');
    expect(fetchMock).toHaveBeenCalledWith('http://x/clone', expect.any(Object));
  });

  it('throws on upstream error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const svc = new AudioService({ modelEndpoint: 'http://x' });
    await expect(svc.clone('a', 'b')).rejects.toThrow('Clone failed: 500');
  });
});
```

## 4. Expose via API gateway

In `apps/api/src/`, create `audio.controller.ts`:

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { AudioService } from '@ai-video-factory/audio-service';

@Controller('audio')
export class AudioController {
  private svc = new AudioService({
    modelEndpoint: process.env.AUDIO_MODEL_URL ?? 'http://localhost:9100',
    apiKey: process.env.AUDIO_MODEL_KEY,
  });

  @Post('clone')
  async clone(@Body() body: { referenceAudio: string; text: string }) {
    return this.svc.clone(body.referenceAudio, body.text);
  }
}
```

Register in `apps/api/src/app.module.ts`:

```ts
import { AudioController } from './audio.controller';
// ...
controllers: [..., AudioController],
```

## 5. Verify

```bash
pnpm --filter @ai-video-factory/audio-service test
pnpm --filter @ai-video-factory/audio-service type-check
pnpm --filter @ai-video-factory/api type-check
```

## 6. Wire into workflow (optional)

If the service should be a step in the main pipeline, update:

- `apps/worker/workflow-worker/src/main.ts` — call the service in the right step, persist outputs.
- `packages/db/src/schema.ts` + `packages/db/src/queries.ts` — add a new table/query if outputs are structured.
- `packages/shared-types/src/index.ts` — add the new types.

## Conventions

- **Constructor takes a config object** with all env-var-driven values; the controller / worker reads env and constructs the service.
- **No top-level env reads** in the service file. This keeps the service unit-testable without env mutation.
- **Use `import type { Foo }` for type-only imports** — keeps the JS output clean.
- **Tests live next to the code** in `__tests__/`. Use the `require()` mock-hoisting pattern when mocking workspace packages, e.g.:

  ```ts
  jest.mock('@ai-video-factory/db', () => ({
    insertAnalysis: jest.fn().mockResolvedValue({ id: 'r1' }),
  }));
  const { insertAnalysis } = require('@ai-video-factory/db');
  ```

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getWorkflow } from '@ai-video-factory/db';
import type { DatabaseConfig } from '@ai-video-factory/db';

interface WorkflowRoom {
  workflowId: string;
  interval?: NodeJS.Timeout;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/workflow',
})
export class WorkflowGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private rooms = new Map<string, WorkflowRoom>();
  private dbConfig: DatabaseConfig;
  private dbReady = false;

  constructor(
    @InjectQueue('workflow') private workflowQueue: Queue,
    @InjectQueue('render') private renderQueue: Queue,
  ) {
    this.dbConfig = {
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER ?? 'aifactory',
      password: process.env.POSTGRES_PASSWORD ?? 'aifactory_dev',
      database: process.env.POSTGRES_DB ?? 'ai_video_factory',
    };
    this.dbReady = !!(process.env.POSTGRES_HOST || process.env.DATABASE_URL);
  }

  handleConnection(client: Socket) {
    console.log(`[WS] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] Client disconnected: ${client.id}`);
    // Clean up any polling intervals for rooms this client joined
    for (const [roomId, room] of this.rooms.entries()) {
      const stillConnected = this.server.sockets.adapter.rooms.get(roomId);
      if (!stillConnected || stillConnected.size === 0) {
        if (room.interval) clearInterval(room.interval);
        this.rooms.delete(roomId);
      }
    }
  }

  /**
   * Client subscribes to a workflow by emitting 'subscribe' with { workflowId }
   * Server responds with current status and starts polling for updates.
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: { workflowId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { workflowId } = data;
    if (!workflowId) return { error: 'workflowId is required' };

    const roomName = `workflow:${workflowId}`;
    await client.join(roomName);

    // Send initial snapshot
    const snapshot = await this.fetchStatus(workflowId);
    client.emit('status', { workflowId, ...snapshot });

    // Set up polling if not already running for this room
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, { workflowId });
      this.startPolling(roomName, workflowId);
    }

    return { subscribed: true, workflowId };
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() data: { workflowId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { workflowId } = data;
    const roomName = `workflow:${workflowId}`;
    await client.leave(roomName);

    // Stop polling if no clients remain in the room
    const stillConnected = this.server.sockets.adapter.rooms.get(roomName);
    if (!stillConnected || stillConnected.size === 0) {
      const room = this.rooms.get(roomName);
      if (room?.interval) clearInterval(room.interval);
      this.rooms.delete(roomName);
    }

    return { unsubscribed: true, workflowId };
  }

  /**
   * Broadcast a status update to all clients subscribed to a workflow.
   * Can be called by workers/controllers to push real-time updates.
   */
  broadcastStatus(workflowId: string, payload: Record<string, unknown>) {
    const roomName = `workflow:${workflowId}`;
    this.server.to(roomName).emit('status', { workflowId, ...payload });
  }

  private startPolling(roomName: string, workflowId: string) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    let lastStatus = '';
    room.interval = setInterval(async () => {
      const status = await this.fetchStatus(workflowId);
      const statusKey = JSON.stringify(status);
      if (statusKey !== lastStatus) {
        lastStatus = statusKey;
        this.server.to(roomName).emit('status', { workflowId, ...status });
      }
    }, 2000);
  }

  private async fetchStatus(workflowId: string): Promise<Record<string, unknown>> {
    // Try DB first
    if (this.dbReady) {
      try {
        const { createDb } = require('@ai-video-factory/db');
        const { db, pool } = createDb(this.dbConfig);
        const row = await getWorkflow(db, workflowId);
        await pool.end();
        if (row) {
          return {
            status: row.status,
            currentStep: row.currentStep,
            error: row.error,
            updatedAt: row.updatedAt,
            source: 'db',
          };
        }
      } catch (err) {
        console.error('[WS] DB fetch failed:', err);
      }
    }

    // Fallback to BullMQ
    try {
      const [workflowJob, renderJob] = await Promise.all([
        this.workflowQueue.getJob(workflowId),
        this.renderQueue.getJob(workflowId),
      ]);
      const job = workflowJob || renderJob;
      if (!job) {
        return { status: 'unknown', error: 'Workflow not found', source: 'queue' };
      }
      const state = await job.getState();
      return {
        status: state,
        progress: job.progress,
        currentStep: job.data?.currentStep,
        source: 'queue',
      };
    } catch (err) {
      return { status: 'error', error: String(err), source: 'queue' };
    }
  }
}

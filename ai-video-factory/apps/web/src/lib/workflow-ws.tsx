'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface WorkflowStatus {
  workflowId: string;
  status: string;
  currentStep: string;
  error?: string;
  updatedAt?: string;
  source?: string;
  progress?: number;
}

export function useWorkflowStatus(workflowId: string | null) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!workflowId) return;

    const socket: Socket = io(`${API_URL}/workflow`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe', { workflowId });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('status', (payload: WorkflowStatus) => {
      setStatus(payload);
    });

    socket.on('connect_error', () => {
      setConnected(false);
    });

    return () => {
      socket.emit('unsubscribe', { workflowId });
      socket.disconnect();
    };
  }, [workflowId]);

  return { status, connected };
}

interface WorkflowDetailProps {
  workflowId: string;
}

const STEP_LABELS: Record<string, string> = {
  trend: '趋势发现',
  content: '内容提取',
  analysis: '深度分析',
  script: '脚本生成',
  media: '素材生成',
  voice: '语音合成',
  subtitle: '字幕生成',
  render: '视频渲染',
  done: '完成',
};

const STEP_ORDER = ['trend', 'content', 'analysis', 'script', 'media', 'voice', 'subtitle', 'render', 'done'];

export function WorkflowDetail({ workflowId }: WorkflowDetailProps) {
  const { status, connected } = useWorkflowStatus(workflowId);

  const currentStepIndex = status?.currentStep ? STEP_ORDER.indexOf(status.currentStep) : -1;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">实时状态</h2>
        <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-600' : 'text-gray-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
          {connected ? '已连接' : '断开'}
        </span>
      </div>

      {/* Progress steps */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {STEP_ORDER.map((step, idx) => {
            const isCompleted = currentStepIndex > idx || status?.status === 'completed';
            const isCurrent = currentStepIndex === idx && status?.status !== 'completed';
            const isFailed = status?.status === 'failed' && isCurrent;
            return (
              <div
                key={step}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  isFailed
                    ? 'bg-red-100 text-red-700'
                    : isCompleted
                      ? 'bg-green-100 text-green-700'
                      : isCurrent
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                }`}
              >
                <span>{STEP_LABELS[step]}</span>
                {isCompleted && <span>✓</span>}
                {isCurrent && !isFailed && <span className="animate-pulse">●</span>}
                {isFailed && <span>✗</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status detail */}
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">状态</dt>
          <dd className="font-medium text-gray-900">{status?.status ?? '等待中...'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">数据源</dt>
          <dd className="font-medium text-gray-900">{status?.source ?? '-'}</dd>
        </div>
        {status?.error && (
          <div className="col-span-2">
            <dt className="text-red-500">错误</dt>
            <dd className="mt-1 rounded bg-red-50 p-2 font-mono text-xs text-red-700">{status.error}</dd>
          </div>
        )}
        {status?.updatedAt && (
          <div className="col-span-2">
            <dt className="text-gray-500">最后更新</dt>
            <dd className="text-gray-600">{new Date(status.updatedAt).toLocaleString('zh-CN')}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

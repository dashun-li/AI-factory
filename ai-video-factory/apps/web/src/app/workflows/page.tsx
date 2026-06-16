import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Plus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Workflow {
  workflowId: string;
  status: string;
  currentStep: string;
  createdAt: string;
}

async function getWorkflows(): Promise<Workflow[]> {
  try {
    const res = await fetch(`${API_URL}/workflow`, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    return (await res.json()) as Workflow[];
  } catch {
    return [];
  }
}

const statusVariant: Record<string, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  completed: 'success',
  active: 'info',
  waiting: 'warning',
  failed: 'destructive',
};

export default async function WorkflowsPage() {
  const workflows = await getWorkflows();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Activity className="h-7 w-7" /> 工作流监控
          </h1>
          <p className="mt-1 text-muted-foreground">查看所有视频生成任务的状态与进度</p>
        </div>
        <Button asChild>
          <a href="/">
            <Plus className="h-4 w-4" /> 新建任务
          </a>
        </Button>
      </div>

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">暂无工作流任务</p>
            <Button asChild className="mt-4" variant="outline">
              <a href="/">创建第一个任务</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>任务列表</CardTitle>
            <CardDescription>共 {workflows.length} 个工作流</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">ID</th>
                    <th className="pb-3 pr-4 font-medium">当前步骤</th>
                    <th className="pb-3 pr-4 font-medium">状态</th>
                    <th className="pb-3 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {workflows.map((wf) => (
                    <tr key={wf.workflowId} className="text-sm">
                      <td className="py-3 pr-4 font-mono text-xs">{wf.workflowId}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{wf.currentStep}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusVariant[wf.status] ?? 'secondary'}>
                          {wf.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(wf.createdAt).toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

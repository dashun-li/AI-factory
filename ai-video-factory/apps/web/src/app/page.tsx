import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Link2, Type, Globe2 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">热点发现</h1>
        <p className="mt-2 text-muted-foreground">从爆款视频一键生成同款原创短视频</p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            创建新工作流
          </CardTitle>
          <CardDescription>输入视频 URL 或关键词，AI 将自动完成分析、脚本、渲染全流程</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/discover" method="POST" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> 输入热门视频/文章 URL
              </Label>
              <Input
                id="url"
                name="url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keyword" className="flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5" /> 或输入热点关键词
              </Label>
              <Input
                id="keyword"
                name="keyword"
                type="text"
                placeholder="输入关键词搜索热点..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform" className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5" /> 目标平台
              </Label>
              <select
                id="platform"
                name="platform"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="douyin">抖音</option>
                <option value="kuaishou">快手</option>
                <option value="xiaohongshu">小红书</option>
                <option value="bilibili">B站</option>
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>
            <Button type="submit" size="lg" className="w-full">
              <Sparkles className="h-4 w-4" />
              开始生成视频
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>分析任务</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>生成脚本</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>输出视频</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

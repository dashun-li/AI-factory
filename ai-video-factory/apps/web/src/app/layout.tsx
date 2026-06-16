import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Video Factory',
  description: 'AI爆款视频自动生成平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <nav className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <a href="/" className="text-xl font-bold text-gray-900">
              AI Video Factory
            </a>
            <div className="flex gap-6">
              <a href="/" className="text-gray-600 hover:text-gray-900">
                热点发现
              </a>
              <a href="/workflows" className="text-gray-600 hover:text-gray-900">
                工作流
              </a>
              <a href="/scripts" className="text-gray-600 hover:text-gray-900">
                脚本
              </a>
              <a href="/videos" className="text-gray-600 hover:text-gray-900">
                视频
              </a>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

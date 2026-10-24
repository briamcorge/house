import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Copy, RefreshCw, RotateCcw } from 'lucide-react';
import { captureBoundaryError } from '../lib/bug-report/collector';
import { copyText, formatBugReportMarkdown } from '../lib/bug-report/format';
import type { BugReportPayload } from '../lib/bug-report/types';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  report: BugReportPayload | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, report: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, report: null, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    // 只落本地队列；用户点“复制诊断包”后才可能粘贴到对话里。
    const report = captureBoundaryError(error, errorInfo.componentStack ?? undefined);
    this.setState({ report });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, report: null, copied: false });
  };

  handleCopyReport = async (): Promise<void> => {
    if (!this.state.report) return;
    const ok = await copyText(formatBugReportMarkdown(this.state.report));
    this.setState({ copied: ok });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-sm w-full text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">页面出错了</h2>
            <p className="text-sm text-gray-500 mb-4">
              渲染页面时发生意外错误，请尝试重试
            </p>
            {this.state.error && (
              <details className="mb-5 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600 transition-colors">
                  查看错误详情
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs text-red-600 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="space-y-2">
              {this.state.report && (
                <button
                  onClick={this.handleCopyReport}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  {this.state.copied ? '已复制，粘贴到对话即可' : '复制诊断包'}
                </button>
              )}
              <div className="flex gap-2">
                <button
                  onClick={this.handleRetry}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  重试
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  重新加载
                </button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                诊断包只保存在本机，不会自动上传；复制后直接粘贴到对话里即可，不需要再手打错误信息。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

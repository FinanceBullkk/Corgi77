import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { captureError } from '../lib/monitoring';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { operation: 'ErrorBoundary', extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="error-screen">
            <div className="error-icon">💥</div>
            <h2>Ứng dụng gặp lỗi</h2>
            <p>Đã xảy ra lỗi không xác định. Vui lòng tải lại hoặc liên hệ Ban tổ chức.</p>
            <button className="btn" onClick={() => window.location.reload()}>
              Tải lại
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

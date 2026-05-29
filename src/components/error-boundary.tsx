import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="error-screen">
            <div className="error-icon">💥</div>
            <h2>Ứng dụng gặp lỗi</h2>
            <p>{this.state.error.message || 'Lỗi không xác định.'}</p>
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

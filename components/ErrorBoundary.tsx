'use client';

import { Component, ReactNode } from 'react';
import { AlertIcon } from './Icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="flex justify-center mb-3 text-red-600">
              <AlertIcon className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-red-900 mb-1">Something went wrong</h3>
            <p className="text-sm text-red-700 mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

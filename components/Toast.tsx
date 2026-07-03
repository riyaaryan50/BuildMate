'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onClose, 300);
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white';
      case 'error':
        return 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white';
      case 'warning':
        return 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white';
      case 'info':
        return 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10">
            <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-500 animate-in zoom-in duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/10">
            <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-500 animate-in zoom-in duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      case 'warning':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500/10">
            <svg className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-500 animate-in zoom-in duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01" />
            </svg>
          </div>
        );
      case 'info':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/10">
            <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500 animate-in zoom-in duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16h-1v-4h-1m1-4h.01" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div
      className={`${getStyles()} rounded-xl shadow-lg backdrop-blur-md p-3 min-w-[300px] max-w-md flex items-center gap-3 ${
        isExiting ? 'animate-out fade-out slide-out-to-right-full duration-300' : 'animate-in slide-in-from-right-full fade-in duration-300'
      }`}
    >
      <div className="flex-shrink-0">{getIcon()}</div>
      <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{message}</p>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(onClose, 300);
        }}
        className="flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md p-1 transition-all duration-200 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col space-y-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast message={toast.message} type={toast.type} onClose={() => onRemove(toast.id)} />
        </div>
      ))}
    </div>
  );
}

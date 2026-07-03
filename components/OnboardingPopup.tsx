'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface OnboardingPopupProps {
  userProfile: any;
}

export default function OnboardingPopup({ userProfile }: OnboardingPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if user hasn't completed onboarding
    if (userProfile && !userProfile.completedOnboarding) {
      // Check if popup was dismissed in this session (only in browser)
      if (typeof window !== 'undefined') {
        const dismissed = sessionStorage.getItem('onboardingPopupDismissed');
        if (!dismissed) {
          // Show popup after a short delay for better UX
          const timer = setTimeout(() => {
            setIsVisible(true);
          }, 1500);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [userProfile]);

  const handleDismiss = () => {
    setIsVisible(false);
    // Store dismissal in sessionStorage (will reset when browser/tab closes)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboardingPopupDismissed', 'true');
    }
  };

  const handleComplete = () => {
    router.push('/onboarding');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-lg">Complete Your Profile</h3>
            <button
              onClick={handleDismiss}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tell us about yourself to get personalized project recommendations and enhance your BuildMate experience.
              </p>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Personalized project suggestions</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Better AI mentor responses</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Track your learning journey</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Later
            </button>
            <button
              onClick={handleComplete}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl hover:from-primary-700 hover:to-primary-800 transition-all hover:shadow-lg hover:scale-105 active:scale-95"
            >
              Complete Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

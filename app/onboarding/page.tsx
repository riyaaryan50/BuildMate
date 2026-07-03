'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateProfile } from 'firebase/auth';

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  // Pre-fill name from Google account if available
  const [name, setName] = useState(user?.displayName || '');
  const [bio, setBio] = useState('');
  const [skillText, setSkillText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !skillText.trim()) return;

    setLoading(true);
    setError('');

    try {
      console.log('📝 Submitting onboarding for user:', user.uid);
      
      let parsedData = {
        skills: [],
        preferredTech: [],
        experience: 'beginner',
        timeBudget: 'flexible'
      };

      // Try to parse skills using Gemini AI
      try {
        const response = await fetch('/api/parse-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: skillText, uid: user.uid }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Profile parsed:', data);
          parsedData = {
            skills: data.skills || [],
            preferredTech: data.preferredTech || [],
            experience: data.experience || 'beginner',
            timeBudget: data.timeBudget || 'flexible'
          };
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.warn('⚠️ AI parsing failed, continuing with defaults:', errorData);
        }
      } catch (parseError) {
        console.warn('⚠️ AI parsing failed, continuing with defaults:', parseError);
      }

      const finalName = name.trim() || user.displayName || user.email?.split('@')[0] || 'User';

      // Update Firebase Auth profile
      if (finalName !== user.displayName) {
        await updateProfile(user, { displayName: finalName });
      }

      // Update user profile in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: finalName,
        bio: bio.trim(),
        profileText: skillText.trim(), // Save the raw text for manual editing later
        skills: parsedData.skills,
        preferredTech: parsedData.preferredTech,
        experience: parsedData.experience,
        timeBudget: parsedData.timeBudget,
        completedOnboarding: true,
      });

      console.log('✅ Profile updated, navigating to home...');
      
      // Add a small delay to ensure Firestore update propagates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force a page reload to refresh auth context
      window.location.href = '/home';
    } catch (error: any) {
      console.error('❌ Error saving profile:', error);
      setError(error.message || 'Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!user) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('⏭️ Skipping onboarding for user:', user.uid);
      
      const finalName = name.trim() || user.displayName || user.email?.split('@')[0] || 'User';

      // Update Firebase Auth profile
      if (finalName !== user.displayName) {
        await updateProfile(user, { displayName: finalName });
      }

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: finalName,
        bio: bio.trim(),
        completedOnboarding: true,
        skills: [],
        preferredTech: [],
        experience: 'beginner',
        timeBudget: 'flexible',
      });
      
      console.log('✅ Onboarding skipped, navigating to home...');
      
      // Add a small delay to ensure Firestore update propagates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force a page reload to refresh auth context
      window.location.href = '/home';
    } catch (error: any) {
      console.error('❌ Error skipping onboarding:', error);
      setError(error.message || 'Failed to skip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to BuildMate! 🚀
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Tell us about your skills and goals in your own words
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder="Enter your name"
            />
            {user?.displayName && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                ✓ Pre-filled from your Google account
              </p>
            )}
          </div>

          {/* Bio Field */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Short Bio (Optional)
            </label>
            <textarea
              id="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
              placeholder="Tell us a bit about yourself..."
            />
          </div>

          {/* Skills Field */}
          <div>
            <label htmlFor="skills" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Describe your skills, experience, and project goals
            </label>
            <textarea
              id="skills"
              rows={6}
              value={skillText}
              onChange={(e) => setSkillText(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
              placeholder="Example: I'm a beginner web developer with basic HTML, CSS, and JavaScript knowledge. I've completed a few online courses on React. I want to build a full-stack project using modern technologies. I have about 10 hours per week to dedicate to learning and building."
              required
            />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              💡 Include: your experience level, technologies you know, time available, and what you want to learn
            </p>
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                🤖 <strong>AI-Powered:</strong> We'll automatically extract your skills and preferences. You can always update them later in your profile!
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              <strong>⚠️ Note:</strong> {error}
              <p className="mt-1 text-xs">Don't worry! Your profile will still be saved. You can add skills manually in your profile page.</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading || !skillText.trim()}
              className="flex-1 py-3 px-6 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving...' : 'Skip for now'}
            </button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Why we ask:
          </h3>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start">
              <span className="text-primary-500 mr-2">✓</span>
              <span>Get personalized project suggestions that match your skill level</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-500 mr-2">✓</span>
              <span>Receive realistic timelines based on your availability</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-500 mr-2">✓</span>
              <span>Get AI mentor guidance tailored to your learning pace</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

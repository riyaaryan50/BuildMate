'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, getDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/Toast';
import { useTheme } from '@/contexts/ThemeContext';
import OnboardingPopup from '@/components/OnboardingPopup';

interface Project {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  estimatedTime: string;
}

export default function HomePage() {
  const { user, userProfile, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toasts, removeToast, success, error } = useToast();
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingRoadmap, setCreatingRoadmap] = useState(false);
  const [suggestedProjects, setSuggestedProjects] = useState<Project[]>([]);
  const [generatedProjects, setGeneratedProjects] = useState<Project[]>([]);
  const [cachedSearchQuery, setCachedSearchQuery] = useState('');
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Get user display name and avatar
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const userAvatar = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&bold=true`;

  useEffect(() => {
    if (authLoading) return; // Wait for auth to load
    
    if (!user) {
      router.push('/auth');
      return;
    }

    // Load suggested projects and user's existing projects
    loadSuggestedProjects();
    loadUserProjects();
    
    // Restore cached search results from localStorage
    const cached = localStorage.getItem('cachedSearchResults');
    if (cached) {
      try {
        const { query, projects, timestamp } = JSON.parse(cached);
        // Cache expires after 1 hour
        if (Date.now() - timestamp < 3600000) {
          setGeneratedProjects(projects);
          setCachedSearchQuery(query);
          setInput(query);
        } else {
          localStorage.removeItem('cachedSearchResults');
        }
      } catch (e) {
        console.error('Error restoring cache:', e);
      }
    }
  }, [user, userProfile, router, authLoading]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const loadSuggestedProjects = async () => {
    if (!user) return;
    
    try {
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      const profile = profileDoc.data();
      
      if (profile?.suggestedProjects) {
        setSuggestedProjects(profile.suggestedProjects);
      } else {
        // Generate initial suggestions
        const response = await fetch('/api/suggest-projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, profile }),
        });
        const data = await response.json();
        setSuggestedProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Error loading suggested projects:', error);
    }
  };

  const loadUserProjects = async () => {
    if (!user) return;
    
    try {
      const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
      const snapshot = await getDocs(q);
      const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserProjects(projects);
      console.log('✅ Home page loaded user projects:', projects.length);
    } catch (error) {
      console.error('❌ Error loading user projects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    setLoading(true);
    setGeneratedProjects([]);
    setCachedSearchQuery(input.trim());

    try {
      // Determine if input is a skill or project idea
      const response = await fetch('/api/generate-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          input: input.trim(),
          uid: user.uid,
          profile: userProfile
        }),
      });

      const data = await response.json();
      const projects = data.projects || [];
      setGeneratedProjects(projects);
      
      // Cache the results in localStorage
      localStorage.setItem('cachedSearchResults', JSON.stringify({
        query: input.trim(),
        projects: projects,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('Error generating projects:', err);
      error('Failed to generate projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleShuffleProjects = async () => {
    if (!cachedSearchQuery || !user) return;

    setLoading(true);
    try {
      // Generate new projects with the same query
      const response = await fetch('/api/generate-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          input: cachedSearchQuery,
          uid: user.uid,
          profile: userProfile
        }),
      });

      const data = await response.json();
      const projects = data.projects || [];
      setGeneratedProjects(projects);
      
      // Update cache with new results
      localStorage.setItem('cachedSearchResults', JSON.stringify({
        query: cachedSearchQuery,
        projects: projects,
        timestamp: Date.now()
      }));
      
      success('✨ Generated new project ideas!');
    } catch (err) {
      console.error('Error shuffling projects:', err);
      error('Failed to generate new projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = async (project: Project) => {
    if (!user) return;
    
    setCreatingRoadmap(true);
    try {
      const response = await fetch('/api/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          project,
          uid: user.uid,
          profile: userProfile
        }),
      });

      if (!response.ok) {
        // Get detailed error message from API response
        let errorMessage = `Failed to generate project roadmap (Status: ${response.status})`;
        try {
          const errorData = await response.json();
          console.error('API Error Response:', {
            status: response.status,
            statusText: response.statusText,
            data: errorData
          });
          errorMessage = errorData.error || errorData.message || errorData.details || errorMessage;
        } catch (parseError) {
          console.error('Could not parse error response:', parseError);
          // Try to get response text if JSON parsing fails
          try {
            const text = await response.text();
            console.error('Raw error response:', text);
            if (text) errorMessage = `${errorMessage}: ${text.substring(0, 200)}`;
          } catch (textError) {
            console.error('Could not read response text');
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Validate that we got the expected data
      if (!data.projectData) {
        throw new Error('Invalid response from server - missing project data');
      }
      
      // Save project to Firestore on client side
      const projectRef = await addDoc(collection(db, 'projects'), data.projectData);
      
      success('🎉 Project created successfully!');
      setTimeout(() => router.push(`/project/${projectRef.id}`), 1000);
    } catch (err: any) {
      console.error('Error creating project:', err);
      const errorMsg = err.message || 'Failed to create project. Please try again.';
      error(errorMsg);
      setCreatingRoadmap(false);
    }
    // Don't set loading to false here - let the navigation handle it
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Onboarding Popup - Session dismissible */}
      <OnboardingPopup userProfile={userProfile} />
      
      {/* Animated Loading Screen Overlay for Roadmap Creation */}
      {creatingRoadmap && (
        <div className="fixed inset-0 bg-gradient-to-br from-primary-600/95 via-primary-700/95 to-primary-800/95 dark:from-gray-900/98 dark:via-gray-800/98 dark:to-gray-900/98 backdrop-blur-sm z-[9999] flex items-center justify-center animate-in fade-in duration-300">
          <div className="text-center space-y-8 px-4">
            {/* Animated Robot/Building Icon */}
            <div className="relative inline-block">
              <div className="w-32 h-32 bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-sm border-2 border-white/20 animate-pulse">
                <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              
              {/* Spinning circles around the icon */}
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
                <div className="absolute top-0 left-1/2 w-3 h-3 bg-white rounded-full -translate-x-1/2"></div>
              </div>
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}>
                <div className="absolute bottom-0 left-1/2 w-3 h-3 bg-white/70 rounded-full -translate-x-1/2"></div>
              </div>
            </div>

            {/* Loading Text */}
            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-white animate-pulse">
                Creating Your Project Roadmap
              </h2>
              <p className="text-white/80 text-lg max-w-md mx-auto">
                Our AI is crafting a personalized learning path just for you...
              </p>
            </div>

            {/* Progress Steps */}
            <div className="space-y-3 max-w-sm mx-auto">
              <div className="flex items-center space-x-3 text-white/90 animate-in slide-in-from-left duration-500">
                <svg className="w-5 h-5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm">Analyzing project requirements...</span>
              </div>
              <div className="flex items-center space-x-3 text-white/90 animate-in slide-in-from-left duration-700">
                <svg className="w-5 h-5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ animationDelay: '0.2s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm">Generating milestones and tasks...</span>
              </div>
              <div className="flex items-center space-x-3 text-white/90 animate-in slide-in-from-left duration-1000">
                <svg className="w-5 h-5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ animationDelay: '0.4s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm">Curating learning resources...</span>
              </div>
            </div>

            {/* Helpful Tip */}
            <div className="mt-8 p-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl max-w-md mx-auto">
              <p className="text-white/90 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-semibold">Tip:</span> Each project includes milestones, tasks, and curated resources to help you learn effectively!
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Minimal Header */}
      <header className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 sticky top-0 z-50 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <button 
              onClick={() => router.push('/home')}
              className="flex items-center space-x-2 group"
            >
              <div className="w-9 h-9 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center transform group-hover:scale-110 transition-transform duration-200">
                <span className="text-white dark:text-gray-900 font-bold text-lg">B</span>
              </div>
              <span className="text-xl font-semibold text-gray-900 dark:text-white">BuildMate</span>
            </button>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              <button 
                onClick={() => router.push('/home')} 
                className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 rounded-lg transition-colors duration-200"
              >
                Home
              </button>
              <button 
                onClick={() => router.push('/dashboard')} 
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Dashboard
              </button>
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-2"></div>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
              >
                <img
                  src={userAvatar}
                  alt={displayName}
                  className="w-9 h-9 rounded-full ring-2 ring-gray-200 dark:ring-gray-700 transform group-hover:scale-110 transition-transform duration-200"
                />
                <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {displayName}
                </span>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200" ref={menuRef}>
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
                  </div>
                  
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/profile');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors duration-150"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>My Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/dashboard');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors duration-150"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>My Projects</span>
                  </button>

                  <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        signOut();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3 transition-colors duration-150"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-16">
          <div className="inline-block mb-6">
            <span className="px-4 py-2 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm font-semibold">
              ✨ Welcome back, {user?.displayName || 'Developer'}!
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
            What do you want to{' '}
            <span className="bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent">
              build today?
            </span>
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Enter a skill you want to learn or describe your dream project. Our AI will create a personalized roadmap just for you.
          </p>
        </div>

        {/* Main Input */}
        <div className="max-w-4xl mx-auto mb-16">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-700 rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity"></div>
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g., 'React hooks' or 'A task management app'"
                className="w-full px-8 py-6 text-lg border-2 border-gray-200 dark:border-gray-700 rounded-3xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white shadow-xl placeholder-gray-400 dark:placeholder-gray-500 transition-all"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-8 py-3.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Generating...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>Generate</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                )}
              </button>
            </div>
          </form>
          
          {/* Enhanced Quick suggestions */}
          <div className="mt-8">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Quick Start
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { text: 'React hooks', icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><path d="M12,2c-1.5,0-2.7,0.3-3.6,0.9C7.5,3.5,7,4.3,7,5.2v1.6C5.3,7.3,4,8,3.1,9c-1,1.1-1.5,2.5-1.5,4.2c0,1.7,0.5,3.1,1.5,4.2c0.9,1,2.2,1.7,3.9,2.2v1.6c0,0.9,0.5,1.7,1.4,2.3c0.9,0.6,2.1,0.9,3.6,0.9c1.5,0,2.7-0.3,3.6-0.9c0.9-0.6,1.4-1.4,1.4-2.3v-1.6c1.7-0.5,3-1.2,3.9-2.2c1-1.1,1.5-2.5,1.5-4.2c0-1.7-0.5-3.1-1.5-4.2c-0.9-1-2.2-1.7-3.9-2.2V5.2c0-0.9-0.5-1.7-1.4-2.3C14.7,2.3,13.5,2,12,2z"/></svg>, iconColor: 'text-blue-500', bgColor: 'bg-blue-500/10' },
                { text: 'Node.js API', icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.85c-.27 0-.55.07-.78.2l-7.44 4.3c-.48.28-.78.8-.78 1.36v8.58c0 .56.3 1.08.78 1.36l1.95 1.12c.95.46 1.27.47 1.71.47 1.4 0 2.21-.85 2.21-2.33V8.44c0-.12-.1-.22-.22-.22H8.5c-.13 0-.23.1-.23.22v8.47c0 .66-.68 1.31-1.77.76L4.45 16.5a.26.26 0 0 1-.11-.21V7.71c0-.09.04-.17.11-.21l7.44-4.29c.06-.04.16-.04.22 0l7.44 4.29c.07.04.11.12.11.21v8.58c0 .08-.04.16-.11.21l-7.44 4.29c-.06.04-.16.04-.22 0L10.6 20c-.06-.03-.14-.03-.19 0-.5.28-.59.32-1.08.5-.13.05-.31.12.07.35l2.51 1.49c.24.14.5.21.77.21.27 0 .54-.07.77-.21l7.44-4.3c.48-.28.78-.8.78-1.36V7.71c0-.56-.3-1.08-.78-1.36l-7.44-4.3c-.23-.13-.5-.2-.77-.2z"/></svg>, iconColor: 'text-green-600', bgColor: 'bg-green-500/10' },
                { text: 'Todo app', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>, iconColor: 'text-purple-600', bgColor: 'bg-purple-500/10' },
                { text: 'Weather dashboard', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>, iconColor: 'text-orange-600', bgColor: 'bg-orange-500/10' }
              ].map((suggestion) => (
                <button
                  key={suggestion.text}
                  onClick={() => setInput(suggestion.text)}
                  className="group relative px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-200 hover:shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <div className={`${suggestion.bgColor} ${suggestion.iconColor} p-1 rounded-md group-hover:scale-110 transition-transform duration-200`}>
                      {suggestion.icon}
                    </div>
                    <span>{suggestion.text}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Suggested Projects */}
        {suggestedProjects.length > 0 && !generatedProjects.length && (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Suggested for you
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Based on your profile and interests
                </p>
              </div>
              <div className="flex items-center space-x-2 text-primary-600 dark:text-primary-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-medium">Personalized</span>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {suggestedProjects.map((project, index) => (
                <ProjectCard key={index} project={project} onSelect={handleSelectProject} loading={creatingRoadmap} />
              ))}
            </div>
          </div>
        )}

        {/* Generated Projects */}
        {generatedProjects.length > 0 && (
          <div className="mb-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
              <div className="flex-1">
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Your custom projects
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  AI-generated specifically for "{cachedSearchQuery || input}"
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleShuffleProjects}
                  disabled={loading}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <svg 
                    className={`w-5 h-5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm font-semibold">Shuffle Ideas</span>
                </button>
                <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Fresh</span>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {generatedProjects.map((project, index) => (
                <ProjectCard key={index} project={project} onSelect={handleSelectProject} loading={creatingRoadmap} />
              ))}
            </div>
          </div>
        )}

        {/* Recent Projects */}
        {userProjects.length > 0 && (
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Your recent projects
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              {userProjects.slice(0, 3).map((project) => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/project/${project.id}`)}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-shadow cursor-pointer p-6 border border-gray-200 dark:border-gray-700"
                >
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {project.title}
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                    {project.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {project.progress?.completedTasks || 0} / {project.progress?.totalTasks || 0} tasks
                    </span>
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-primary-600 h-2 rounded-full transition-all"
                        style={{ width: `${project.progress?.progressPercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ProjectCard({ project, onSelect, loading }: { project: Project; onSelect: (p: Project) => void; loading?: boolean }) {
  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all cursor-pointer border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 overflow-hidden transform hover:-translate-y-1">
      {/* Header with gradient */}
      <div className={`h-2 ${
        project.difficulty === 'beginner' ? 'bg-gradient-to-r from-green-400 to-green-600' :
        project.difficulty === 'intermediate' ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
        'bg-gradient-to-r from-red-400 to-red-600'
      }`}></div>
      
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
            project.difficulty === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
            project.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}>
            {project.difficulty}
          </span>
          <div className="flex items-center space-x-1 text-amber-500">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        </div>
        
        <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          {project.title}
        </h4>
        
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 line-clamp-3 leading-relaxed">
          {project.description}
        </p>
        
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">{project.estimatedTime}</span>
          </div>
        </div>
        
        <button
          onClick={() => onSelect(project)}
          disabled={loading}
          className="w-full py-3 px-4 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2"
        >
          <span>Start Building</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

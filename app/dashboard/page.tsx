'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
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
  status: string;
  category?: string;
  progress: {
    completedTasks: number;
    totalTasks: number;
    progressPercent: number;
  };
  createdAt: any;
}

export default function DashboardPage() {
  const { user, userProfile, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toasts, removeToast, success, error } = useToast();
  const { theme } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'progress' | 'title'>('recent');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string; title: string; step: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return; // Wait for auth to load
    
    if (!user) {
      router.push('/auth');
      return;
    }

    loadProjects();
  }, [user, router, authLoading]);

  const loadProjects = async () => {
    if (!user) return;
    
    try {
      // Try with orderBy first (requires index)
      let q = query(
        collection(db, 'projects'),
        where('ownerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      
      try {
        const snapshot = await getDocs(q);
        const projectsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Project[];
        
        setProjects(projectsData);
        console.log('✅ Loaded projects:', projectsData.length);
      } catch (indexError: any) {
        // If index error, fall back to simple query without orderBy
        if (indexError.code === 'failed-precondition') {
          console.warn('⚠️ Firestore index needed, loading without sort...');
          const simpleQuery = query(
            collection(db, 'projects'),
            where('ownerId', '==', user.uid)
          );
          const snapshot = await getDocs(simpleQuery);
          const projectsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Project[];
          
          // Sort manually by createdAt on client side
          projectsData.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });
          
          setProjects(projectsData);
          console.log('✅ Loaded projects (without index):', projectsData.length);
        } else {
          throw indexError;
        }
      }
    } catch (error) {
      console.error('❌ Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories from projects
  const categories = ['all', ...Array.from(new Set(projects.map(p => p.category).filter(Boolean)))];

  // Filter and sort projects
  const filteredProjects = projects
    .filter(p => {
      // Status filter
      if (filter === 'active' && (p.status !== 'active' || p.progress.progressPercent >= 100)) return false;
      if (filter === 'completed' && p.progress.progressPercent !== 100) return false;
      
      // Category filter
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime.getTime() - aTime.getTime();
      } else if (sortBy === 'progress') {
        return b.progress.progressPercent - a.progress.progressPercent;
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

  const handleDeleteClick = (projectId: string, projectTitle: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to project
    setDeleteConfirmation({ id: projectId, title: projectTitle, step: 1 });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation) return;

    if (deleteConfirmation.step === 1) {
      // First confirmation - move to step 2
      setDeleteConfirmation({ ...deleteConfirmation, step: 2 });
    } else {
      // Second confirmation - actually delete
      setDeleting(true);
      try {
        await deleteDoc(doc(db, 'projects', deleteConfirmation.id));
        // Remove from local state
        setProjects(projects.filter(p => p.id !== deleteConfirmation.id));
        console.log('✅ Project deleted successfully');
        success('🗑️ Project deleted successfully');
        setDeleteConfirmation(null);
      } catch (err) {
        console.error('❌ Error deleting project:', err);
        error('Failed to delete project. Please try again.');
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation(null);
  };

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get user display name and avatar
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const userAvatar = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&bold=true`;

  // Helper function to get category icon
  const getCategoryIcon = (category: string | undefined): React.ReactNode => {
    if (!category) return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    );
    
    const icons: { [key: string]: React.ReactNode } = {
      'dsa': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
      'web development': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>,
      'mobile development': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
      'ai/ml': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
      'devops': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      'database': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
      'game development': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      'backend': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>,
      'frontend': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>,
      'fullstack': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>,
      'data science': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      'cybersecurity': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
      'blockchain': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
      'cloud': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>,
      'general': <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
    };
    return icons[category.toLowerCase()] || icons['general'];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Onboarding Popup - Session dismissible */}
      <OnboardingPopup userProfile={userProfile} />
      
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
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Home
              </button>
              <button 
                onClick={() => router.push('/dashboard')} 
                className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 rounded-lg transition-colors duration-200"
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
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
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
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
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
                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3"
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
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2">
              Your Projects
            </h2>
            <p className="text-gray-600 dark:text-gray-400 flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>{projects.length} total project{projects.length !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <button
            onClick={() => router.push('/home')}
            className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Project</span>
          </button>
        </div>

        {/* Enhanced Filter Tabs with Filter/Sort Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-10">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all transform hover:scale-105 ${
                filter === 'all'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-2 border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="flex items-center space-x-2">
                <span>All</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  filter === 'all' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  {projects.length}
                </span>
              </span>
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all transform hover:scale-105 ${
                filter === 'active'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-2 border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="flex items-center space-x-2">
                <span>Active</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  filter === 'active' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  {projects.filter(p => p.status === 'active' && p.progress.progressPercent < 100).length}
                </span>
              </span>
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all transform hover:scale-105 ${
                filter === 'completed'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-2 border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="flex items-center space-x-2">
                <span>Completed</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  filter === 'completed' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  {projects.filter(p => p.progress.progressPercent === 100).length}
                </span>
              </span>
            </button>
          </div>

          {/* Filter & Sort Button */}
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 transition-all transform hover:scale-105 flex items-center space-x-2 shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span>Filter & Sort</span>
              {(categoryFilter !== 'all' || sortBy !== 'recent') && (
                <span className="w-2 h-2 bg-primary-600 rounded-full"></span>
              )}
            </button>

            {/* Dropdown Menu */}
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Sort Section */}
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Sort By</h4>
                  <div className="space-y-1">
                    <button
                      onClick={() => setSortBy('recent')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        sortBy === 'recent'
                          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Most Recent</span>
                    </button>
                    <button
                      onClick={() => setSortBy('progress')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        sortBy === 'progress'
                          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span>Progress %</span>
                    </button>
                    <button
                      onClick={() => setSortBy('title')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        sortBy === 'title'
                          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                      <span>Alphabetical</span>
                    </button>
                  </div>
                </div>

                {/* Category Filter Section */}
                {categories.length > 1 && (
                  <div className="px-4 py-2">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Category</h4>
                    <div className="space-y-1">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat || 'all')}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors capitalize flex items-center gap-2 ${
                            categoryFilter === cat
                              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          {cat === 'all' ? (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              <span>All Categories</span>
                            </>
                          ) : (
                            <>
                              {getCategoryIcon(cat)}
                              <span>{cat}</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reset Button */}
                {(categoryFilter !== 'all' || sortBy !== 'recent') && (
                  <div className="px-4 pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                    <button
                      onClick={() => {
                        setCategoryFilter('all');
                        setSortBy('recent');
                      }}
                      className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                    >
                      🔄 Reset Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700">
            <div className="text-7xl mb-6 animate-bounce">📦</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
              {filter === 'all' 
                ? 'Start your learning journey by creating your first project!'
                : `You don't have any ${filter} projects at the moment.`
              }
            </p>
            {filter === 'all' && (
              <button
                onClick={() => router.push('/home')}
                className="px-8 py-4 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Create Your First Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/project/${project.id}`)}
                className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all cursor-pointer border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 overflow-hidden transform hover:-translate-y-2"
              >
                {/* Enhanced Project Header with gradient */}
                <div className={`relative p-6 ${
                  project.progress.progressPercent === 100
                    ? 'bg-gradient-to-br from-green-500 via-green-600 to-green-700'
                    : 'bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700'
                }`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide bg-white/30 backdrop-blur-sm text-white shadow-lg">
                      {project.difficulty}
                    </span>
                    <div className="flex items-center space-x-2">
                      {/* Delete Button - Subtle & Aesthetic */}
                      <button
                        onClick={(e) => handleDeleteClick(project.id, project.title, e)}
                        className="group/delete relative px-3 py-1.5 bg-red-500/90 hover:bg-red-600 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 flex items-center space-x-1.5"
                        title="Delete this project"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="text-white font-semibold text-xs">Delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12"></div>
                </div>

                {/* Project Content */}
                <div className="p-6">
                  {/* Category Tag */}
                  {project.category && (
                    <div className="mb-3">
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold border border-purple-200 dark:border-purple-700">
                        <span>{getCategoryIcon(project.category)}</span>
                        <span className="capitalize">{project.category}</span>
                      </span>
                    </div>
                  )}
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                    {project.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 line-clamp-3 leading-relaxed">
                    {project.description}
                  </p>

                  {/* Enhanced Progress */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Progress</span>
                      <span className="text-lg font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                        {project.progress.progressPercent}%
                      </span>
                    </div>
                    <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-inner">
                      <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
                          project.progress.progressPercent === 100
                            ? 'bg-gradient-to-r from-green-500 to-green-600'
                            : 'bg-gradient-to-r from-primary-500 via-primary-600 to-primary-700'
                        }`}
                        style={{ width: `${project.progress.progressPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{project.progress.completedTasks} / {project.progress.totalTasks} tasks</span>
                      <span className="flex items-center space-x-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Track Progress</span>
                      </span>
                    </div>
                  </div>

                  {/* Enhanced Status Badge/Button */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                    {project.progress.progressPercent === 100 ? (
                      <div className="flex items-center justify-center space-x-2 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl font-semibold border border-green-200 dark:border-green-800">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Project Completed</span>
                      </div>
                    ) : (
                      <button className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white px-4 py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2">
                        <span>Continue Building</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 transform animate-in zoom-in-95 duration-300">
            {/* Warning Icon */}
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                deleteConfirmation.step === 1 
                  ? 'bg-yellow-100 dark:bg-yellow-900/30' 
                  : 'bg-red-100 dark:bg-red-900/30'
              }`}>
                <svg 
                  className={`w-8 h-8 ${
                    deleteConfirmation.step === 1 
                      ? 'text-yellow-600 dark:text-yellow-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Title and Message */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {deleteConfirmation.step === 1 ? 'Delete Project?' : 'Are You Absolutely Sure?'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                {deleteConfirmation.step === 1 
                  ? 'You are about to delete:'
                  : 'This action cannot be undone. You will permanently lose:'
                }
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-lg mb-4">
                "{deleteConfirmation.title}"
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
                {deleteConfirmation.step === 1 
                  ? 'All progress, tasks, and data will be permanently deleted.'
                  : <>
                      <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                      </svg>
                      <span>This will delete all milestones, tasks, and your entire progress!</span>
                    </>
                }
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={deleting}
                className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className={`flex-1 px-6 py-3 font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2 ${
                  deleteConfirmation.step === 1
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white'
                }`}
              >
                {deleting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>{deleteConfirmation.step === 1 ? 'Yes, Delete' : 'Permanently Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

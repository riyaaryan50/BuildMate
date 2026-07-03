'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, updateDoc, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MarkdownMessage } from '@/components/MarkdownMessage';

interface Task {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
  difficulty: string;
  requiredSkills: string[];
  resources: Array<{ title: string; url: string; type: string }>;
  done: boolean;
  locked: boolean;
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
  tasks: Task[];
}

interface ProjectData {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  roadmap: { milestones: Milestone[] };
  progress: { completedTasks: number; totalTasks: number; progressPercent: number };
}

export default function ProjectPage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params?.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showDescription, setShowDescription] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get user display name and avatar
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const userAvatar = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&bold=true`;

  useEffect(() => {
    if (authLoading) return; // Wait for auth to load
    
    if (!user || !projectId) {
      router.push('/auth');
      return;
    }

    // Subscribe to project updates
    const unsubscribe = onSnapshot(doc(db, 'projects', projectId), (doc) => {
      if (doc.exists()) {
        setProject({ id: doc.id, ...doc.data() } as ProjectData);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, projectId, router, authLoading]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-close description panel on scroll
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    function handleScroll() {
      if (showDescription) {
        // Clear any existing timeout
        clearTimeout(scrollTimeout);
        
        // Set a small delay to avoid closing immediately on tiny scrolls
        scrollTimeout = setTimeout(() => {
          setShowDescription(false);
        }, 100);
      }
    }
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [showDescription]);

  const toggleTaskDone = async (milestoneId: string, taskId: string) => {
    if (!project) return;

    // Find the current task to check if we're marking it as done
    let currentTask: Task | null = null;
    for (const milestone of project.roadmap.milestones) {
      for (const task of milestone.tasks) {
        if (milestone.id === milestoneId && task.id === taskId) {
          currentTask = task;
          break;
        }
      }
      if (currentTask) break;
    }

    if (!currentTask || currentTask.locked) return;

    const isMarkingAsDone = !currentTask.done; // Will be true if currently unchecked

    const updatedMilestones = project.roadmap.milestones.map(milestone => {
      if (milestone.id === milestoneId) {
        return {
          ...milestone,
          tasks: milestone.tasks.map(task => {
            if (task.id === taskId) {
              return { ...task, done: !task.done };
            }
            return task;
          })
        };
      }
      return milestone;
    });

    // Find next task to unlock ONLY if we're marking current task as done
    if (isMarkingAsDone) {
      let foundCurrent = false;
      let nextTask: { milestoneId: string; taskId: string } | null = null;
      
      for (const milestone of updatedMilestones) {
        for (const task of milestone.tasks) {
          if (foundCurrent && task.locked && !task.done) {
            nextTask = { milestoneId: milestone.id, taskId: task.id };
            break;
          }
          if (milestone.id === milestoneId && task.id === taskId) {
            foundCurrent = true;
          }
        }
        if (nextTask) break;
      }

      // Unlock next task
      if (nextTask) {
        updatedMilestones.forEach(milestone => {
          if (milestone.id === nextTask!.milestoneId) {
            milestone.tasks.forEach(task => {
              if (task.id === nextTask!.taskId) {
                task.locked = false;
              }
            });
          }
        });
      }
    }

    // Calculate progress
    let completedTasks = 0;
    let totalTasks = 0;
    updatedMilestones.forEach(m => {
      m.tasks.forEach(t => {
        totalTasks++;
        if (t.done) completedTasks++;
      });
    });

    const progressPercent = Math.round((completedTasks / totalTasks) * 100);

    // Update Firestore
    await updateDoc(doc(db, 'projects', projectId), {
      'roadmap.milestones': updatedMilestones,
      'progress.completedTasks': completedTasks,
      'progress.totalTasks': totalTasks,
      'progress.progressPercent': progressPercent,
      updatedAt: new Date(),
    });
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !project || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    // Add user message to chat
    const newUserMsg = {
      sender: 'user',
      text: userMessage,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, newUserMsg]);

    // Gather detailed context about the project state
    const currentMilestone = getCurrentMilestone();
    const completedTasks = project.roadmap.milestones.flatMap(m => 
      m.tasks.filter(t => t.done).map(t => ({ milestone: m.title, task: t.title }))
    );
    const currentTasks = project.roadmap.milestones.flatMap(m => 
      m.tasks.filter(t => !t.done && !t.locked).map(t => ({ 
        milestone: m.title, 
        task: t.title,
        description: t.description,
        skills: t.requiredSkills 
      }))
    );
    const nextTasks = project.roadmap.milestones.flatMap(m => 
      m.tasks.filter(t => t.locked).slice(0, 2).map(t => ({ milestone: m.title, task: t.title }))
    );

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: userMessage,
          conversationHistory: chatMessages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            text: msg.text,
          })),
          context: {
            projectTitle: project.title,
            projectDescription: project.description,
            difficulty: project.difficulty,
            progress: {
              completedTasks: project.progress.completedTasks,
              totalTasks: project.progress.totalTasks,
              progressPercent: project.progress.progressPercent,
            },
            currentMilestone: currentMilestone ? {
              title: currentMilestone.title,
              description: currentMilestone.description,
              tasksCompleted: currentMilestone.tasks.filter(t => t.done).length,
              tasksTotal: currentMilestone.tasks.length,
            } : null,
            recentCompletedTasks: completedTasks.slice(-5), // Last 5 completed
            currentActiveTasks: currentTasks, // Tasks user can work on now
            upcomingTasks: nextTasks, // Next tasks to unlock
            allMilestones: project.roadmap.milestones.map(m => ({
              title: m.title,
              completed: m.tasks.every(t => t.done),
              progress: `${m.tasks.filter(t => t.done).length}/${m.tasks.length}`,
            })),
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || 'Failed to get AI response');
      }

      const data = await response.json();
      console.log('AI Response data:', data); // Debug log

      // Validate AI response and provide fallback
      const responseText = data.response || data.text || data.message;
      if (!responseText || typeof responseText !== 'string') {
        console.error('Invalid response format:', data);
        throw new Error('Invalid AI response format');
      }

      // Add AI response to chat
      const aiMsg = {
        sender: 'ai',
        text: responseText,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, aiMsg]);

      // Save to Firestore - only save valid messages
      try {
        await addDoc(collection(db, 'projects', projectId, 'chat'), {
          sender: newUserMsg.sender,
          text: newUserMsg.text,
          timestamp: newUserMsg.timestamp,
        });
        await addDoc(collection(db, 'projects', projectId, 'chat'), {
          sender: aiMsg.sender,
          text: aiMsg.text,
          timestamp: aiMsg.timestamp,
        });
      } catch (firestoreError) {
        console.error('Error saving to Firestore:', firestoreError);
        // Don't throw - message is already in UI
      }
    } catch (error) {
      console.error('Error sending chat message:', error);
      // Add error message to chat
      const errorMsg = {
        sender: 'ai',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const getCurrentMilestone = () => {
    if (!project) return null;
    for (const milestone of project.roadmap.milestones) {
      const hasIncompleteTasks = milestone.tasks.some(t => !t.done);
      if (hasIncompleteTasks) return milestone;
    }
    return project.roadmap.milestones[project.roadmap.milestones.length - 1];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Project not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Enhanced Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            {/* Logo and Navigation */}
            <div className="flex items-center space-x-8">
              <button 
                onClick={() => router.push('/home')}
                className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xl">B</span>
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                  BuildMate
                </h1>
              </button>
              
              <nav className="hidden md:flex space-x-1">
                <button 
                  onClick={() => router.push('/home')} 
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                  Home
                </button>
                <button 
                  onClick={() => router.push('/dashboard')} 
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                  Dashboard
                </button>
              </nav>
            </div>

            {/* User Profile */}
            <div className="relative user-menu-container" ref={menuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-3 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all group"
              >
                <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                  {displayName}
                </span>
                <img
                  src={userAvatar}
                  alt={displayName}
                  className="w-10 h-10 rounded-full ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-800"
                />
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
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
            </div>
          </div>
        </div>

      </header>

      {/* Collapsible Project Info Panel - Below Navbar */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-md border-b border-gray-200 dark:border-gray-700 sticky top-[88px] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="w-full py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-lg px-2"
          >
            <div className="flex items-center space-x-3">
              <svg 
                className={`w-5 h-5 text-primary-600 dark:text-primary-400 transition-transform duration-300 ${showDescription ? 'rotate-90' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {showDescription ? 'Hide Project Details' : 'Show Project Details'}
              </span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              project.difficulty === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
              project.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
              'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}>
              {project.difficulty}
            </span>
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showDescription ? 'max-h-[400px] opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
            <div className="bg-gradient-to-br from-primary-50 to-white dark:from-gray-700 dark:to-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{project.title}</h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{project.description}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back to Dashboard Button */}
        <button
          onClick={() => router.push('/dashboard')}
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium mb-6 flex items-center space-x-2 transition-colors group"
        >
          <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Dashboard</span>
        </button>

        {/* Enhanced Progress Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Overall Progress</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {project.progress.completedTasks} of {project.progress.totalTasks} tasks completed
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                {project.progress.progressPercent}%
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Complete</p>
            </div>
          </div>
          <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden shadow-inner">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary-500 via-primary-600 to-primary-700 rounded-full transition-all duration-500 shadow-lg flex items-center justify-end pr-2"
              style={{ width: `${project.progress.progressPercent}%` }}
            >
              {project.progress.progressPercent > 10 && (
                <span className="text-white text-xs font-bold">
                  {project.progress.completedTasks}/{project.progress.totalTasks}
                </span>
              )}
            </div>
          </div>
          {project.progress.progressPercent === 100 && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center space-x-3">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-green-800 dark:text-green-200 font-semibold">🎉 Congratulations!</p>
                <p className="text-green-600 dark:text-green-400 text-sm">You've completed all tasks in this project!</p>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Milestones */}
        <div className="space-y-8">
          {project.roadmap.milestones.map((milestone, mIndex) => (
            <div key={milestone.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 transform transition-all hover:shadow-xl">
              <div className="bg-gradient-to-r from-primary-500 via-primary-600 to-primary-700 px-8 py-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <span className="flex items-center justify-center w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl text-lg font-bold text-white shadow-lg">
                      {mIndex + 1}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-white mb-2">
                        {milestone.title}
                      </h3>
                      <p className="text-primary-50 text-sm leading-relaxed">{milestone.description}</p>
                    </div>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                    <p className="text-white text-sm font-semibold">
                      ⏱️ {milestone.estimatedHours}h
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-5">
                {milestone.tasks.map((task, tIndex) => (
                  <div
                    key={task.id}
                    className={`group relative border-2 rounded-xl p-6 transition-all transform hover:scale-[1.02] ${
                      task.locked
                        ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900/50 opacity-70'
                        : task.done
                        ? 'border-green-400 dark:border-green-600 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 shadow-green-100 dark:shadow-green-900/20'
                        : 'border-primary-300 dark:border-primary-700 bg-gradient-to-br from-white to-primary-50/30 dark:from-gray-800 dark:to-primary-900/10 hover:shadow-lg'
                    }`}
                  >
                    {task.done && (
                      <div className="absolute -top-3 -right-3 bg-green-500 text-white rounded-full p-2 shadow-lg">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    <div className="flex items-start gap-5">
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={task.done}
                          disabled={task.locked}
                          onChange={() => toggleTaskDone(milestone.id, task.id)}
                          className="mt-1 w-6 h-6 rounded-lg border-2 border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500 disabled:opacity-50 cursor-pointer transition-all"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                          <h4 className={`text-lg font-bold ${task.done ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                            {task.title}
                          </h4>
                          {task.locked && (
                            <span className="flex items-center space-x-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full font-semibold">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              <span>Locked</span>
                            </span>
                          )}
                          <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wide ${
                            task.difficulty === 'easy' ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' :
                            task.difficulty === 'medium' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                            'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
                          }`}>
                            {task.difficulty}
                          </span>
                        </div>
                        <p className={`text-sm leading-relaxed mb-4 ${task.done ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {task.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-400 mb-4">
                          <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700/50 px-3 py-1.5 rounded-lg">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium">~{task.estimatedHours}h</span>
                          </div>
                          <div className="flex items-center space-x-2 bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 rounded-lg">
                            <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                            <span className="font-medium text-primary-700 dark:text-primary-300">{task.requiredSkills.join(', ')}</span>
                          </div>
                        </div>

                        {/* Resources */}
                        {task.resources && task.resources.length > 0 && !task.locked && (
                          <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-3 flex items-center space-x-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                              <span>Learning Resources</span>
                            </p>
                            <div className="space-y-2">
                              {task.resources.map((resource, rIndex) => (
                                <a
                                  key={rIndex}
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center space-x-3 text-sm text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 font-medium transition-colors group/link"
                                >
                                  <div className="flex-shrink-0">
                                    {resource.type === 'video' ? (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    ) : resource.type === 'article' ? (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                      </svg>
                                    )}
                                  </div>
                                  <span className="group-hover/link:underline">{resource.title}</span>
                                  <svg className="w-4 h-4 opacity-0 group-hover/link:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Floating Chat Toggle Button */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-110 flex items-center justify-center z-50 group"
          title="Open AI Mentor Chat"
        >
          <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
        </button>
      )}

      {/* AI Chat Window */}
      {showChat && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3 rounded-t-2xl flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <h3 className="text-white font-semibold">AI Mentor</h3>
            </div>
            <button 
              onClick={() => setShowChat(false)} 
              className="text-white hover:text-gray-200 hover:bg-white/20 rounded-lg p-1 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-3">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-gray-700 dark:text-gray-300 font-medium">AI Mentor Ready!</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ask me anything about your project 💡</p>
                </div>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-br-md'
                    : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-bl-md'
                }`}>
                  {msg.sender === 'user' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <MarkdownMessage text={msg.text} className="text-sm" />
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white dark:bg-gray-700 px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm border border-gray-200 dark:border-gray-600">
                  <div className="flex space-x-1.5">
                    <div className="w-2 h-2 bg-primary-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                    <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                  placeholder="Type your question..."
                  className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                />
              </div>
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl font-medium transition-all shadow-md hover:shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

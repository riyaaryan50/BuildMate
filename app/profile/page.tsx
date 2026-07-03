'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { updateProfile } from 'firebase/auth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/Toast';
import { useTheme } from '@/contexts/ThemeContext';
import OnboardingPopup from '@/components/OnboardingPopup';

interface UserProfile {
  name: string;
  email: string;
  bio: string;
  skills: string[];
  preferredTech: string[];
  experience: string;
  timeBudget: string;
  photoURL?: string;
}

export default function ProfilePage() {
  const { user, userProfile, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toasts, removeToast, success, error } = useToast();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    bio: '',
    skills: [],
    preferredTech: [],
    experience: 'beginner',
    timeBudget: 'flexible',
  });
  const [editMode, setEditMode] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [newTech, setNewTech] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const userAvatar = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&bold=true`;

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/auth');
      return;
    }

    loadProfile();
  }, [user, authLoading, router]);

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

  const loadProfile = async () => {
    if (!user) return;

    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({
          name: user.displayName || data.name || '',
          email: user.email || '',
          bio: data.bio || '',
          skills: data.skills || [],
          preferredTech: data.preferredTech || [],
          experience: data.experience || 'beginner',
          timeBudget: data.timeBudget || 'flexible',
          photoURL: user.photoURL || data.photoURL,
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `profile-photos/${user.uid}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      // Update Firebase Auth profile
      await updateProfile(user, { photoURL });

      // Update Firestore
      await updateDoc(doc(db, 'users', user.uid), { photoURL });

      setProfile(prev => ({ ...prev, photoURL }));
      
      // Reload the page to update the avatar everywhere
      window.location.reload();
    } catch (err) {
      console.error('Error uploading photo:', err);
      error('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: profile.name,
        bio: profile.bio,
        skills: profile.skills,
        preferredTech: profile.preferredTech,
        experience: profile.experience,
        timeBudget: profile.timeBudget,
      });

      // Update Firebase Auth display name if changed
      if (profile.name !== user.displayName) {
        await updateProfile(user, { displayName: profile.name });
      }

      setEditMode(false);
      success('✅ Profile updated successfully!');
    } catch (err) {
      console.error('Error saving profile:', err);
      error('❌ Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    if (newSkill.trim() && !profile.skills.includes(newSkill.trim())) {
      setProfile(prev => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }));
      setNewSkill('');
    }
  };

  const removeSkill = (skill: string) => {
    setProfile(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }));
  };

  const addTech = () => {
    if (newTech.trim() && !profile.preferredTech.includes(newTech.trim())) {
      setProfile(prev => ({ ...prev, preferredTech: [...prev.preferredTech, newTech.trim()] }));
      setNewTech('');
    }
  };

  const removeTech = (tech: string) => {
    setProfile(prev => ({ ...prev, preferredTech: prev.preferredTech.filter(t => t !== tech) }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-800 border-t-primary-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-primary-400 rounded-full animate-spin" style={{ animationDelay: '150ms', animationDuration: '1.5s' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
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
                    className="w-full text-left px-4 py-2 text-sm text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 flex items-center space-x-3"
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

      {/* Profile Content - Minimal Redesign */}
      <div className="max-w-4xl mx-auto px-6 py-12 animate-in fade-in slide-in-from-bottom duration-700">
        {/* Profile Header Card */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50">
          {/* Simple Header Bar */}
          <div className="relative h-32 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9nPjwvc3ZnPg==')] opacity-10"></div>
            
            {/* Edit Button */}
            <div className="absolute top-6 right-6 animate-in fade-in slide-in-from-right duration-500 delay-200">
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-xl font-medium flex items-center space-x-2 transition-all duration-200 border border-white/20 hover:scale-105 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit</span>
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setEditMode(false);
                      loadProfile();
                    }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-xl font-medium transition-all duration-200 border border-white/20 hover:scale-105 active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-medium disabled:opacity-50 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center space-x-2"
                  >
                    {saving ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save</span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Profile Picture */}
            <div className="absolute -bottom-16 left-8 animate-in fade-in slide-in-from-left duration-500 delay-100">
              <div className="relative group">
                <div className="w-32 h-32 rounded-2xl border-4 border-white dark:border-gray-900 shadow-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 transform transition-transform duration-300 group-hover:scale-105">
                  <img
                    src={profile.photoURL || userAvatar}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {editMode && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 disabled:opacity-50"
                  >
                    {uploadingPhoto ? (
                      <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <div className="pt-20 px-8 pb-8 animate-in fade-in duration-700 delay-300">
            {/* Name and Email */}
            <div className="mb-10">
              {editMode ? (
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                  className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-300 dark:border-gray-700 focus:border-gray-900 dark:focus:border-white px-0 py-2 focus:outline-none transition-colors duration-200 w-full"
                  placeholder="Your Name"
                />
              ) : (
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {profile.name || 'No name set'}
                </h2>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{profile.email}</p>
            </div>

            {/* Bio */}
            <div className="mb-10">
              <label className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400 mb-3 block">About</label>
              {editMode ? (
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent resize-none transition-all duration-200"
                  rows={4}
                  placeholder="Tell us about yourself..."
                />
              ) : (
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {profile.bio || 'No bio added yet.'}
                </p>
              )}
            </div>

            {/* Experience & Time Budget */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="group">
                <label className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400 mb-3 block">Experience Level</label>
                {editMode ? (
                  <select
                    value={profile.experience}
                    onChange={(e) => setProfile(prev => ({ ...prev, experience: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition-all duration-200 cursor-pointer"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                ) : (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 transition-all duration-200 group-hover:border-gray-300 dark:group-hover:border-gray-600">
                    <span className="text-lg font-medium text-gray-900 dark:text-white capitalize">
                      {profile.experience}
                    </span>
                  </div>
                )}
              </div>

              <div className="group">
                <label className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400 mb-3 block">Time Availability</label>
                {editMode ? (
                  <select
                    value={profile.timeBudget}
                    onChange={(e) => setProfile(prev => ({ ...prev, timeBudget: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition-all duration-200 cursor-pointer"
                  >
                    <option value="flexible">Flexible</option>
                    <option value="1-2 hours/day">1-2 hours/day</option>
                    <option value="3-5 hours/day">3-5 hours/day</option>
                    <option value="5+ hours/day">5+ hours/day</option>
                  </select>
                ) : (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 transition-all duration-200 group-hover:border-gray-300 dark:group-hover:border-gray-600">
                    <span className="text-lg font-medium text-gray-900 dark:text-white">
                      {profile.timeBudget}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            <div className="mb-10">
              <label className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400 mb-3 block">Skills</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {profile.skills.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No skills added yet</p>
                ) : (
                  profile.skills.map((skill, index) => (
                    <span
                      key={skill}
                      className="group px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-sm font-medium flex items-center space-x-2 transition-all duration-200 hover:scale-105 animate-in fade-in slide-in-from-bottom duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <span>{skill}</span>
                      {editMode && (
                        <button
                          onClick={() => removeSkill(skill)}
                          className="hover:bg-white/20 dark:hover:bg-black/20 rounded-full p-0.5 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>
              {editMode && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition-all duration-200 text-sm"
                    placeholder="Add a skill..."
                  />
                  <button
                    onClick={addSkill}
                    className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 text-sm"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Preferred Technologies */}
            <div className="mb-8">
              <label className="text-xs uppercase tracking-wider font-medium text-gray-500 dark:text-gray-400 mb-3 block">Preferred Technologies</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {profile.preferredTech.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No technologies added yet</p>
                ) : (
                  profile.preferredTech.map((tech, index) => (
                    <span
                      key={tech}
                      className="group px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-full text-sm font-medium flex items-center space-x-2 transition-all duration-200 hover:scale-105 hover:border-gray-400 dark:hover:border-gray-600 animate-in fade-in slide-in-from-bottom duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <span>{tech}</span>
                      {editMode && (
                        <button
                          onClick={() => removeTech(tech)}
                          className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>
              {editMode && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTech}
                    onChange={(e) => setNewTech(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTech())}
                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition-all duration-200 text-sm"
                    placeholder="Add a technology..."
                  />
                  <button
                    onClick={addTech}
                    className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 text-sm"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

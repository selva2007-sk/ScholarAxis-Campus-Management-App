
import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { User, Application, ApplicationStatus, UserRole, Notification, ApprovalEntry } from '../types';
import { db } from '../services/db';
import { CheckCircle2, LogOut, Bell, Clock, UserCircle2, Sun, Moon, GraduationCap, Calendar, X } from 'lucide-react';
import { NotificationType } from '../components/NotificationToast';
import { consumeNotificationRoute, NotificationRoute, subscribeToNotificationRoute } from '../src/pushNotifications';

interface StaffDashboardProps {
  user: User;
  onLogout: () => void;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  notify: (message: string, type: NotificationType) => void;
}

const StaffDashboard: React.FC<StaffDashboardProps> = ({ user, onLogout, toggleTheme, theme, notify }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'profile'>('pending');
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const refreshData = useCallback(async () => {
    const [allApps, allNotifications] = await Promise.all([db.getApplications(), db.getNotifications(user.id)]);
    setNotifications(allNotifications);
    
    let relevantApps: Application[] = [];
    if (user.role === UserRole.TUTOR) {
        relevantApps = allApps.filter(app => app.tutorId === user.id);
    } else if (user.role === UserRole.COORDINATOR) {
        relevantApps = allApps.filter(app => app.coordinatorId === user.id && app.status !== ApplicationStatus.PENDING_TUTOR);
    } else if (user.role === UserRole.HOD) {
        relevantApps = allApps.filter(app => app.hodId === user.id && (app.status === ApplicationStatus.PENDING_HOD || app.status === ApplicationStatus.APPROVED || app.status === ApplicationStatus.REJECTED));
    }

    if (filter === 'pending') {
      relevantApps = relevantApps.filter(app => {
        if (user.role === UserRole.TUTOR) return app.status === ApplicationStatus.PENDING_TUTOR;
        if (user.role === UserRole.COORDINATOR) return app.status === ApplicationStatus.PENDING_COORDINATOR;
        if (user.role === UserRole.HOD) return app.status === ApplicationStatus.PENDING_HOD;
        return false;
      });
    } else if (filter === 'approved') {
       relevantApps = relevantApps.filter(app => {
         const inHistory = app.approvalHistory.some(h => h.role === user.role && h.userName === user.name);
         const isFinal = app.status === ApplicationStatus.APPROVED;
         
         if (user.role === UserRole.TUTOR) return inHistory; 
         if (user.role === UserRole.COORDINATOR) return inHistory || (app.status === ApplicationStatus.PENDING_HOD);
         if (user.role === UserRole.HOD) return isFinal || inHistory;
         return false;
       });
    }
    setApplications(relevantApps);
  }, [filter, user.id, user.role, user.name]);


  useEffect(() => {
    void refreshData();
    const int = setInterval(() => {
      void refreshData();
    }, 5000);
    return () => clearInterval(int);
  }, [refreshData]);

  useEffect(() => {
    const applyRoute = (route: NotificationRoute) => {
      if (!route?.screen) return;
      if (route.screen === 'pending') setFilter('pending');
      if (route.screen === 'approved') setFilter('approved');
      if (route.screen === 'profile') setFilter('profile');
    };

    const pending = consumeNotificationRoute();
    if (pending) applyRoute(pending);

    return subscribeToNotificationRoute(applyRoute);
  }, []);

  const handleAction = async (appId: string) => {
    try {
      const app = applications.find(a => a.id === appId);
      if (!app) return;

      let nextStatus: ApplicationStatus;

      if (user.role === UserRole.TUTOR && app.status === ApplicationStatus.PENDING_TUTOR) {
        nextStatus = ApplicationStatus.PENDING_COORDINATOR;
      } else if (user.role === UserRole.COORDINATOR && app.status === ApplicationStatus.PENDING_COORDINATOR) {
        nextStatus = ApplicationStatus.PENDING_HOD;
      } else if (user.role === UserRole.HOD && app.status === ApplicationStatus.PENDING_HOD) {
        nextStatus = ApplicationStatus.APPROVED;
      } else {
        notify("Invalid workflow action.", "error");
        return;
      }

      const historyEntry: ApprovalEntry = {
        role: user.role,
        action: 'Approved',
        timestamp: Date.now(),
        userName: user.name
      };

      await db.updateApplication(appId, {
        status: nextStatus,
        approvalHistory: [...app.approvalHistory, historyEntry]
      }, user);

      notify("Approved & Forwarded.", "info");
      await refreshData();
    } catch (err: any) {
      notify(err.message || "Action failed.", "error");
    }
  };

  const handleClearNotifications = async () => {
    try {
      await db.clearNotifications(user.id);
      setNotifications([]);

      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.removeAllDeliveredNotifications();
        } catch {
          // ignore device notification cleanup failures
        }
      }

      notify('Notifications cleared.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Failed to clear notifications.', 'error');
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#020617] lg:flex-row transition-colors text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      <aside className="hidden lg:flex flex-col w-72 bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-800 shrink-0 z-20 h-full pt-safe">
        <div className="p-8 flex flex-col items-center border-b border-slate-100 dark:border-slate-800/50">
          <img src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" alt="SREC" className="w-24 h-auto mb-5" />
          <div className="text-center">
             <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">ScholarAxis</h1>
             <p className="text-xs font-semibold text-[#006837] uppercase tracking-wider mt-1">Faculty Portal</p>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-6 overflow-y-auto">
            <button onClick={() => setFilter('pending')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${filter === 'pending' ? 'bg-[#006837] text-white font-semibold shadow-md shadow-green-900/10' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><Clock className="mr-3 h-5 w-5" />Pending Review</button>
            <button onClick={() => setFilter('approved')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${filter === 'approved' ? 'bg-[#006837] text-white font-semibold shadow-md shadow-green-900/10' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><CheckCircle2 className="mr-3 h-5 w-5" />Action History</button>
            <button onClick={() => setFilter('profile')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${filter === 'profile' ? 'bg-[#006837] text-white font-semibold shadow-md shadow-green-900/10' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><UserCircle2 className="mr-3 h-5 w-5" />Profile</button>
        </nav>
        <div className="p-6 border-t dark:border-slate-800 mt-auto">
          <button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"><LogOut className="mr-3 h-4 w-4" />Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="app-header bg-white dark:bg-[#0f172a] px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 transition-all z-20">
          <div className="flex items-center min-w-0 space-x-4">
             <div className="h-10 w-10 bg-[#006837] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm ring-4 ring-green-50 dark:ring-green-900/20">{user.name[0]}</div>
             <div className="min-w-0 flex flex-col">
               <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{user.name}</h2>
               <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{user.role}</p>
             </div>
          </div>
          <div className="flex items-center space-x-3 shrink-0">
             <button onClick={toggleTheme} className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</button>
             <div className="relative">
                <button
                  onClick={() => {
                    setIsNotifOpen(!isNotifOpen);
                    if (!isNotifOpen) {
                      void db.markAllNotificationsRead(user.id).then(() => {
                        void refreshData();
                      });
                    }
                  }}
                 className="relative p-2.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
               >
                 <Bell className="h-5 w-5" />
                 {unreadCount > 0 && <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white dark:border-[#0f172a]"></span>}
               </button>
               {isNotifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#0f172a] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-fade-in origin-top-right ring-1 ring-black/5">
                   <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50">
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-200">Notifications</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleClearNotifications}
                          disabled={notifications.length === 0}
                          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Clear All
                        </button>
                        <button onClick={() => setIsNotifOpen(false)} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><X className="h-4 w-4 text-slate-500" /></button>
                      </div>
                   </div>
                   <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                     {notifications.map(n => (
                         <div key={n.id} className={`p-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${n.status === 'unread' ? 'bg-green-50/40 dark:bg-green-900/10' : ''}`}>
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                              <span className="text-xs text-slate-400 font-medium">{new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">{n.message}</p>
                         </div>
                     ))}
                   </div>
                </div>
              )}
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar pb-24 lg:pb-10 app-content">
          {filter === 'profile' ? (
            <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
               <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Staff Profile</h3>
               
               <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="h-32 bg-gradient-to-r from-slate-700 to-slate-900"></div>
                  <div className="px-8 pb-8 relative">
                     <div className="flex flex-col md:flex-row items-start md:items-end -mt-12 mb-6 gap-6">
                        <div className="h-32 w-32 rounded-3xl bg-white dark:bg-slate-900 p-1.5 shadow-xl">
                           <div className="h-full w-full bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-300">
                              <UserCircle2 className="h-16 w-16" />
                           </div>
                        </div>
                        <div className="flex-1 mb-2">
                           <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{user.name}</h2>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-semibold text-[#006837] uppercase tracking-wide bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">{user.role}</span>
                              <span className="h-1 w-1 bg-slate-300 rounded-full"></span>
                              <span className="text-sm text-slate-500">{user.employeeId || 'ID: N/A'}</span>
                           </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Department</label>
                           <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{user.department}</p>
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Email Address</label>
                           <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{user.email}</p>
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Batch / Joining Year</label>
                           <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{user.batch || user.joinYear || 'N/A'}</p>
                        </div>
                        {/* Semester is not applicable for staff */}
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
              {applications.length === 0 ? (
                <div className="col-span-full py-24 bg-white dark:bg-[#0f172a] rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                  <Clock className="h-16 w-16 text-slate-200 dark:text-slate-800 mb-4" />
                  <p className="text-lg font-semibold text-slate-500">No {filter === 'pending' ? 'pending' : 'historical'} records found.</p>
                </div>
              ) : (
                applications.map(app => (
                  <div key={app.id} className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                     <div className="flex items-center mb-5">
                        <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#006837] mr-4 shrink-0"><GraduationCap className="h-6 w-6" /></div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-base text-slate-900 dark:text-white truncate">{app.studentName}</h4>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{app.regNo}</p>
                        </div>
                     </div>
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl mb-6 flex-1 border border-slate-100 dark:border-slate-800/30">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Scholarship</p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">{app.scholarshipName}</p>
                     </div>
                     {filter === 'pending' ? (
                       <button onClick={() => handleAction(app.id)} className="w-full py-2.5 rounded-xl text-white bg-[#006837] font-bold text-xs uppercase tracking-wide shadow-md shadow-green-900/10 hover:bg-[#00522a] transition-colors">Approve</button>
                     ) : (
                       <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                         <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${app.status === ApplicationStatus.APPROVED ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'}`}>{app.status}</span>
                         <p className="text-xs font-medium text-slate-400">{new Date(app.timestamp).toLocaleDateString()}</p>
                       </div>
                     )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 flex justify-around p-2 pb-safe z-50">
          <button onClick={() => setFilter('pending')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${filter === 'pending' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <Clock className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Pending</span>
          </button>
          <button onClick={() => setFilter('approved')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${filter === 'approved' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <CheckCircle2 className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">History</span>
          </button>
          <button onClick={() => setFilter('profile')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${filter === 'profile' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <UserCircle2 className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Profile</span>
          </button>
          <button onClick={onLogout} className="flex flex-col items-center p-3 rounded-xl transition-all text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10">
              <LogOut className="h-6 w-6" />
              <span className="text-[10px] font-bold mt-1">Logout</span>
          </button>
        </nav>
      </main>
    </div>
  );
};

export default StaffDashboard;


import React, { useState, useEffect, useMemo } from 'react';
import { User, Scholarship, Application, UserRole, ApplicationStatus, ScholarshipType } from '../types';
import { db } from '../services/db';
import { Plus, Trash2, FileText, Settings, LogOut, Bell, X, Sun, Moon, UserCircle2, GraduationCap, BarChart3, Users, CheckCircle2, XCircle, Landmark, UserPlus, Fingerprint, Mail, Key, Phone, PenLine, TrendingUp, PieChart } from 'lucide-react';
import { NotificationType } from '../components/NotificationToast';
import { consumeNotificationRoute, NotificationRoute, subscribeToNotificationRoute } from '../src/pushNotifications';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  notify: (message: string, type: NotificationType) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout, toggleTheme, theme, notify }) => {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'manage' | 'applications' | 'users' | 'analytics' | 'profile'>('manage');
  const [deleteId, setDeleteId] = useState<{ type: 'sch' | 'user'; id: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('All');
  const [newType, setNewType] = useState<ScholarshipType>(ScholarshipType.INSTITUTIONAL);

  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uMobile, setUMobile] = useState('');
  const [uRole, setURole] = useState<UserRole>(UserRole.STUDENT);
  const [uDept, setUDept] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRegNo, setURegNo] = useState('');
  const [uEmpId, setUEmpId] = useState('');

  useEffect(() => {
    void refreshData();
    const interval = setInterval(() => {
      void refreshData();
    }, 5000);
    return () => interval && clearInterval(interval);
  }, []);

  useEffect(() => {
    const applyRoute = (route: NotificationRoute) => {
      if (!route?.screen) return;
      if (route.screen === 'manage') setActiveTab('manage');
      if (route.screen === 'users') setActiveTab('users');
      if (route.screen === 'applications') setActiveTab('applications');
      if (route.screen === 'analytics') setActiveTab('analytics');
      if (route.screen === 'profile') setActiveTab('profile');
    };

    const pending = consumeNotificationRoute();
    if (pending) applyRoute(pending);

    return subscribeToNotificationRoute(applyRoute);
  }, []);

  const refreshData = async () => {
    const [allScholarships, allApplications, allUsers] = await Promise.all([
      db.getScholarships(),
      db.getApplications(),
      db.getUsers()
    ]);

    setScholarships(allScholarships);
    setApplications(allApplications);
    setUsers(allUsers);
  };

  const handleToggleScholarship = async (id: string) => {
    try {
      await db.toggleScholarship(id);
      await refreshData();
      notify("Status updated.", "info");
    } catch (err) {
      notify("Failed to toggle status.", "error");
    }
  };

  const resetSchForm = () => { setNewName(''); setNewDept('All'); setNewType(ScholarshipType.INSTITUTIONAL); };
  
  const resetUserForm = () => { 
    setUName(''); setUEmail(''); setUMobile(''); setURole(UserRole.STUDENT); setUDept(''); setUPass(''); setURegNo(''); setUEmpId(''); 
    setEditingUser(null);
  };
  
  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setUName(user.name);
    setUEmail(user.email);
    setUMobile(user.mobileNumber || '');
    setURole(user.role);
    setUDept(user.department);
    setUPass(user.password || '');
    setURegNo(user.regNo || '');
    setUEmpId(user.employeeId || '');
    setIsUserModalOpen(true);
  };

  const handleAddScholarship = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newName) { notify("Required fields missing.", "warning"); return; }
      
      const newSch: Scholarship = { 
          id: 'sch-' + Date.now(), 
          name: newName, 
          description: '', 
          amount: 0, 
          type: newType, 
          departmentEligibility: newDept,
          createdAt: Date.now(), 
          deadline: 0, 
          isActive: true 
      };
      
      await db.addScholarship(newSch);
      notify("Scheme published successfully.", "success");
      await refreshData();
      setIsAddModalOpen(false);
      resetSchForm();
    } catch (err) { notify("Failed to add scheme.", "error"); }
  };

  const handleAddOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userData: any = {
        name: uName, email: uEmail, mobileNumber: uMobile, role: uRole, department: uDept, password: uPass,
        regNo: uRole === UserRole.STUDENT ? uRegNo : undefined,
        employeeId: uRole !== UserRole.STUDENT ? uEmpId : undefined,
      };

      if (uRole === UserRole.STUDENT) {
        userData.joinYear = editingUser?.joinYear || new Date().getFullYear().toString();
        userData.semester = 4;
        userData.batch = '2024-2028';
      }

      if (editingUser) {
        await db.updateUser(editingUser.id, userData, user);
        notify("User updated.", "success");
      } else {
        userData.id = 'usr-' + Date.now();
        userData.joinYear = new Date().getFullYear().toString();
        await db.addUser(userData as User, user);
        notify("User created.", "success");
      }
      await refreshData();
      setIsUserModalOpen(false);
      resetUserForm();
    } catch (err) { notify("Failed to save account.", "error"); }
  };

  const executeDelete = async () => {
    if (deleteId) {
      if (deleteId.type === 'sch') await db.deleteScholarship(deleteId.id);
      else await db.deleteUser(deleteId.id, user);
      notify("Record removed.", "info");
      await refreshData();
      setDeleteId(null);
    }
  };

  const analytics = useMemo(() => {
    return {
      totalApps: applications.length,
      totalUsers: users.length,
      totalScholarships: scholarships.length,
      perScholarship: scholarships.map(s => ({ name: s.name, count: applications.filter(a => a.scholarshipId === s.id).length })).sort((a, b) => b.count - a.count),
      perDept: Array.from(new Set(users.map(u => u.department))).map(d => ({ name: d, count: users.filter(u => u.department === d).length })).sort((a,b) => b.count - a.count)
    };
  }, [applications, scholarships, users]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#020617] lg:flex-row transition-colors text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      
      <aside className="hidden lg:flex flex-col w-64 bg-[#001a0d] text-white shrink-0 z-20 h-full pt-safe">
        <div className="p-8 flex flex-col items-center border-b border-white/10">
          <img src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" alt="Logo" className="w-20 h-auto brightness-0 invert mb-4" />
          <h1 className="text-lg font-bold text-white">SREC</h1>
          <p className="text-xs text-white/60 font-medium uppercase tracking-wider mt-1">Admin Console</p>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-6 overflow-y-auto">
             <button onClick={() => setActiveTab('manage')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'manage' ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}><Settings className="mr-3 h-5 w-5" />Management</button>
             <button onClick={() => setActiveTab('users')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'users' ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}><Users className="mr-3 h-5 w-5" />Users</button>
             <button onClick={() => setActiveTab('applications')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'applications' ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}><FileText className="mr-3 h-5 w-5" />Registry</button>
             <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'analytics' ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}><BarChart3 className="mr-3 h-5 w-5" />Insights</button>
             <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'profile' ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}><UserCircle2 className="mr-3 h-5 w-5" />Profile</button>
        </nav>
        <div className="p-6 border-t border-white/5 mt-auto">
          <button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-red-400 font-semibold text-sm hover:bg-white/5 rounded-xl transition-all"><LogOut className="mr-3 h-4 w-4" />Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="app-header bg-white dark:bg-[#0f172a] px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between transition-all gap-4 z-50 shadow-sm md:shadow-none">
          <div className="flex items-center min-w-0 space-x-4">
             <div className="h-10 w-10 bg-[#006837] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm ring-4 ring-green-50 dark:ring-green-900/20">{user.name[0]}</div>
             <div className="min-w-0 flex flex-col">
                 <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{user.name}</h2>
                 <p className="text-xs font-medium text-[#006837] uppercase tracking-wide truncate">Administrator</p>
             </div>
          </div>
          <div className="flex items-center space-x-3 shrink-0">
            <button onClick={toggleTheme} className="p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">{theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</button>
            {activeTab === 'manage' && (
              <button onClick={() => setIsAddModalOpen(true)} className="bg-[#006837] text-white px-5 py-2.5 rounded-lg flex items-center font-bold uppercase text-xs tracking-wide shadow-md hover:bg-[#00522a] transition-all"><Plus className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Add Scheme</span></button>
            )}
            {activeTab === 'users' && (
              <button onClick={() => { resetUserForm(); setIsUserModalOpen(true); }} className="bg-[#006837] text-white px-5 py-2.5 rounded-lg flex items-center font-bold uppercase text-xs tracking-wide shadow-md hover:bg-[#00522a] transition-all"><UserPlus className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Enroll User</span></button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar pb-24 lg:pb-10 relative z-0 app-content">
          {activeTab === 'manage' && (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {scholarships.map(sch => (
                  <div key={sch.id} className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col hover:shadow-lg transition-all relative group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="h-12 w-12 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-center justify-center text-[#006837] transition-all shrink-0"><Landmark className="h-6 w-6" /></div>
                      <div className="flex items-center space-x-2">
                        <button onClick={() => handleToggleScholarship(sch.id)} className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${sch.isActive ? 'bg-emerald-500' : 'bg-red-500'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${sch.isActive ? 'translate-x-5.5' : 'translate-x-1'}`} />
                        </button>
                        <button onClick={() => setDeleteId({ type: 'sch', id: sch.id })} className="p-2 text-red-500 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <h3 className="font-bold text-lg mb-2 leading-tight text-slate-900 dark:text-white line-clamp-1">{sch.name}</h3>
                    <p className="text-sm text-slate-500 mb-6 line-clamp-2 leading-relaxed flex-1">{sch.description}</p>
                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end items-center">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide ${sch.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{sch.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'users' && (
            <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 animate-fade-in flex flex-col overflow-hidden">
               <div className="overflow-x-auto custom-scrollbar">
                 <table className="w-full text-left min-w-[800px]">
                   <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs font-bold uppercase tracking-wider"><tr><th className="px-8 py-5">User Identity</th><th className="px-8 py-5">Department</th><th className="px-8 py-5">Role</th><th className="px-8 py-5 text-right">Actions</th></tr></thead>
                   <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                     {users.map(u => (
                       <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
                         <td className="px-8 py-5">
                           <div className="flex items-center">
                             <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#006837] mr-4"><UserCircle2 className="h-6 w-6" /></div>
                             <div><div className="font-bold text-sm text-slate-900 dark:text-white">{u.name}</div><div className="text-xs text-slate-500 font-medium uppercase mt-0.5">{u.regNo || u.employeeId || 'System ID'}</div></div>
                           </div>
                         </td>
                         <td className="px-8 py-5"><span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{u.department}</span></td>
                         <td className="px-8 py-5"><span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${u.role === UserRole.STUDENT ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-green-50 text-green-700 border-green-100'}`}>{u.role}</span></td>
                         <td className="px-8 py-5 text-right">
                           <div className="flex items-center justify-end space-x-2">
                             <button onClick={() => openEditUserModal(u)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"><PenLine className="h-4 w-4" /></button>
                             {u.id !== user.id && <button onClick={() => setDeleteId({ type: 'user', id: u.id })} className="p-2 text-red-500 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>}
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}
          {activeTab === 'applications' && (
             <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 animate-fade-in flex flex-col overflow-hidden">
               <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <tr><th className="px-8 py-5">Student</th><th className="px-8 py-5">Department</th><th className="px-8 py-5">Program</th><th className="px-8 py-5 text-right">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {applications.map(app => (
                      <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer">
                        <td className="px-8 py-5">
                           <div className="flex items-center">
                              <div className="h-9 w-9 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-[#006837] mr-3"><GraduationCap className="h-5 w-5" /></div>
                              <div className="min-w-0"><p className="font-bold text-sm text-slate-900 dark:text-white truncate">{app.studentName}</p><p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{app.regNo}</p></div>
                           </div>
                        </td>
                        <td className="px-8 py-5 uppercase text-xs font-semibold text-slate-600 dark:text-slate-400">{app.department}</td>
                        <td className="px-8 py-5 text-sm font-medium text-slate-700 dark:text-slate-300">{app.scholarshipName}</td>
                        <td className="px-8 py-5 text-right"><span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${app.status === ApplicationStatus.APPROVED ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{app.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === 'analytics' && (
             <div className="space-y-8 animate-fade-in pb-20">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-6 opacity-[0.05] text-[#006837]"><FileText className="h-24 w-24" /></div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Applications</p>
                     <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{analytics.totalApps}</h3>
                  </div>
                  <div className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-6 opacity-[0.05] text-[#006837]"><Landmark className="h-24 w-24" /></div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Active Scholarships</p>
                     <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{analytics.totalScholarships}</h3>
                  </div>
                  <div className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-6 opacity-[0.05] text-[#006837]"><Users className="h-24 w-24" /></div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">User Base</p>
                     <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{analytics.totalUsers}</h3>
                  </div>
               </div>
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
                     <div className="flex items-center mb-6"><div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 mr-4"><TrendingUp className="h-5 w-5" /></div><h4 className="font-bold text-base uppercase tracking-wide">Scholarship Reach</h4></div>
                     <div className="space-y-6 flex-1">
                        {analytics.perScholarship.map((item, idx) => (
                           <div key={idx} className="space-y-2"><div className="flex justify-between text-xs font-bold text-slate-500"><span className="truncate pr-4">{item.name}</span><span>{item.count}</span></div><div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max((item.count / analytics.totalApps) * 100, 2)}%` }}></div></div></div>
                        ))}
                     </div>
                  </div>
                  <div className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
                     <div className="flex items-center mb-6"><div className="h-10 w-10 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center text-purple-600 mr-4"><PieChart className="h-5 w-5" /></div><h4 className="font-bold text-base uppercase tracking-wide">Department Activity</h4></div>
                     <div className="space-y-6 flex-1">
                        {analytics.perDept.map((item, idx) => (
                           <div key={idx} className="space-y-2"><div className="flex justify-between text-xs font-bold text-slate-500"><span className="truncate pr-4">{item.name}</span><span>{item.count}</span></div><div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max((item.count / analytics.totalUsers) * 100, 2)}%` }}></div></div></div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          )}
          {activeTab === 'profile' && (
            <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
               <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Admin Profile</h3>
               
               <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="h-32 bg-gradient-to-r from-gray-800 to-black"></div>
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
                              <span className="text-sm font-semibold text-white bg-slate-900 px-2 py-0.5 rounded uppercase tracking-wide">System Admin</span>
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
                           <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{user.batch || user.joinYear || '2020'}</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 flex justify-around p-2 pb-safe z-50">
          <button onClick={() => setActiveTab('manage')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${activeTab === 'manage' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <Settings className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Manage</span>
          </button>
          <button onClick={() => setActiveTab('users')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${activeTab === 'users' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <Users className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Users</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${activeTab === 'profile' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <UserCircle2 className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Profile</span>
          </button>
          <button onClick={onLogout} className="flex flex-col items-center p-3 rounded-xl transition-all text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10">
              <LogOut className="h-6 w-6" />
              <span className="text-[10px] font-bold mt-1">Logout</span>
          </button>
        </nav>

        {/* Modals for Add/Edit */}
        {isUserModalOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#0f172a] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-fade-in flex flex-col max-h-[90vh]">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                 <h3 className="text-xl font-bold tracking-tight">{editingUser ? 'Update Profile' : 'Enrollment'}</h3>
                 <button onClick={() => setIsUserModalOpen(false)} className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-sm hover:text-red-500 transition-all"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleAddOrUpdateUser} className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Role</label><select value={uRole} onChange={(e) => setURole(e.target.value as UserRole)} className="w-full px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-[#006837]" disabled={!!editingUser}>{Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Department</label><input required value={uDept} onChange={(e) => setUDept(e.target.value)} className="w-full px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-[#006837]" placeholder="Type department name" /></div>
                </div>
                <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Full Name</label><div className="relative"><UserCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" /><input required value={uName} onChange={(e) => setUName(e.target.value)} className="w-full pl-12 pr-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-[#006837]" placeholder="Full legal name" /></div></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8"><div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label><div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" /><input required type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} className="w-full pl-12 pr-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-[#006837]" placeholder="user@srec.com" disabled={!!editingUser} /></div></div><div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Mobile</label><div className="relative"><Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" /><input required type="tel" value={uMobile} onChange={(e) => setUMobile(e.target.value)} className="w-full pl-12 pr-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-[#006837]" placeholder="9876543210" /></div></div></div>
                {!editingUser && (<div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Initial Password</label><div className="relative"><Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" /><input required value={uPass} onChange={(e) => setUPass(e.target.value)} className="w-full pl-12 pr-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-[#006837]" placeholder="Access token" /></div></div>)}
                {uRole === UserRole.STUDENT ? (<div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 space-y-6"><h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center mb-4"><GraduationCap className="h-4 w-4 mr-2" /> Academic Profile</h4><div className="space-y-2"><label className="text-xs font-bold text-blue-400 uppercase tracking-wider">Register No</label><input required value={uRegNo} onChange={(e) => setURegNo(e.target.value)} className="w-full px-5 py-3 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900 outline-none text-sm font-semibold uppercase" placeholder="7178..." disabled={!!editingUser} /></div></div>) : (<div className="bg-green-50/50 dark:bg-green-900/10 p-6 rounded-2xl border border-green-100 dark:border-green-800 space-y-6"><h4 className="text-xs font-bold uppercase tracking-wider text-[#006837] flex items-center mb-4"><Fingerprint className="h-4 w-4 mr-2" /> Faculty Details</h4><div className="space-y-2"><label className="text-xs font-bold text-green-600 uppercase tracking-wider">Employee ID</label><input required value={uEmpId} onChange={(e) => setUEmpId(e.target.value)} className="w-full px-5 py-3 rounded-xl bg-white dark:bg-slate-800 border border-green-100 dark:border-green-900 outline-none text-sm font-semibold uppercase" placeholder="SREC-FAC-..." disabled={!!editingUser} /></div></div>)}
                <button type="submit" className="w-full py-5 bg-[#006837] text-white rounded-xl font-bold shadow-lg hover:bg-[#00522a] transition-all text-sm uppercase tracking-widest flex items-center justify-center">{editingUser ? 'Save Changes' : 'Activate Account'}</button>
              </form>
            </div>
          </div>
        )}
        {deleteId && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#0f172a] p-10 rounded-3xl w-full max-w-sm text-center shadow-2xl animate-fade-in border border-slate-200 dark:border-slate-800">
               <div className="h-20 w-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6"><Trash2 className="h-10 w-10 text-red-500" /></div>
               <h3 className="text-xl font-bold mb-3">Confirm Deletion</h3>
               <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">Permanently purge this {deleteId.type === 'sch' ? 'scholarship' : 'user account'} from institutional records?</p>
               <div className="grid grid-cols-2 gap-4"><button onClick={() => setDeleteId(null)} className="py-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-xs text-slate-500 hover:bg-slate-200 uppercase tracking-wide">Cancel</button><button onClick={executeDelete} className="py-3 bg-red-600 rounded-xl font-bold text-xs text-white hover:bg-red-700 shadow-md uppercase tracking-wide">Delete</button></div>
            </div>
          </div>
        )}
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#0f172a] w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-fade-in">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-xl font-bold tracking-tight">Configure Scholarship</h3>
                 <button onClick={() => setIsAddModalOpen(false)} className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-sm hover:text-red-500"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleAddScholarship} className="p-8 space-y-6">
                <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Program Name</label><input required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none font-semibold text-sm focus:border-[#006837]" placeholder="e.g. Merit Excellence" /></div>
                <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Type</label><select value={newType} onChange={(e) => setNewType(e.target.value as ScholarshipType)} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none font-semibold text-sm appearance-none"><option value={ScholarshipType.INSTITUTIONAL}>Institutional</option><option value={ScholarshipType.GOVERNMENT}>Government</option></select></div>
                <button type="submit" className="w-full py-4 bg-[#006837] text-white rounded-xl font-bold shadow-lg hover:bg-[#00522a] transition-all uppercase tracking-widest text-xs">Publish Opportunity</button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;

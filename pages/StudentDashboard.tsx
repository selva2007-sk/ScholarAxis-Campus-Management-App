
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { User, Scholarship, Application, ApplicationStatus, UserRole, Notification, ScholarshipType } from '../types';
import { db } from '../services/db';
import { LayoutDashboard, FileText, Bell, LogOut, X, CheckCircle2, XCircle, Clock, Sun, Moon, GraduationCap, School, Download, Printer, QrCode, User as UserIcon, BookOpen, Mail, LayoutGrid, List, AlertCircle, Landmark, Calendar, Loader2, ArrowRight } from 'lucide-react';
import { NotificationType } from '../components/NotificationToast';
import { consumeNotificationRoute, NotificationRoute, subscribeToNotificationRoute } from '../src/pushNotifications';

interface StudentDashboardProps {
  user: User;
  onLogout: () => void;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  notify: (message: string, type: NotificationType) => void;
}

// Declare html2pdf for TypeScript
declare const html2pdf: any;

const A4_PREVIEW_BASE_WIDTH = 800;
const A4_PREVIEW_BASE_HEIGHT = Math.round((A4_PREVIEW_BASE_WIDTH * 297) / 210);

const sanitizeFileSegment = (value: string) =>
  value.trim().replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

const normalizeDepartment = (value?: string) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, onLogout, toggleTheme, theme, notify }) => {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'scholarships' | 'applications' | 'academic'>('scholarships');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [selectedScholarship, setSelectedScholarship] = useState<Scholarship | null>(null);
  const [viewingBonafide, setViewingBonafide] = useState<Application | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);

  // Application Form State
  const [selectedTutor, setSelectedTutor] = useState('');
  const [selectedCoord, setSelectedCoord] = useState('');
  const [selectedHod, setSelectedHod] = useState('');
  const [purpose, setPurpose] = useState('');

  // Routing Options
  const [availableTutors, setAvailableTutors] = useState<User[]>([]);
  const [availableCoords, setAvailableCoords] = useState<User[]>([]);
  const [availableHods, setAvailableHods] = useState<User[]>([]);

  const refreshData = useCallback(async () => {
    const [allSch, allApplications, allNotifications] = await Promise.all([
      db.getScholarships(),
      db.getApplications(),
      db.getNotifications(user.id)
    ]);

    const userDepartment = normalizeDepartment(user.department);
    setScholarships(
      allSch.filter(s => {
        if (s.isActive === false) return false;
        const eligibility = normalizeDepartment(s.departmentEligibility || 'All');
        return eligibility === 'all' || eligibility === userDepartment;
      })
    );
    setApplications(allApplications.filter(app => app.studentId === user.id));
    setNotifications(allNotifications);
  }, [user.id, user.department]);


  useEffect(() => {
    void refreshData();
    const interval = setInterval(() => {
      void refreshData();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  useEffect(() => {
    const applyRoute = (route: NotificationRoute) => {
      if (!route?.screen) return;
      if (route.screen === 'applications') setActiveTab('applications');
      if (route.screen === 'scholarships') setActiveTab('scholarships');
      if (route.screen === 'academic' || route.screen === 'profile') setActiveTab('academic');
    };

    const pending = consumeNotificationRoute();
    if (pending) applyRoute(pending);

    return subscribeToNotificationRoute(applyRoute);
  }, []);

  // Load Authorities based on Department
  useEffect(() => {
    const loadAuthorities = async () => {
      const allUsers = await db.getUsers();
      const userDepartment = normalizeDepartment(user.department);

      const deptTutors = allUsers.filter(
        u => u.role === UserRole.TUTOR && normalizeDepartment(u.department) === userDepartment
      );
      setAvailableTutors(deptTutors);

      const validCoords = allUsers.filter(
        u =>
          u.role === UserRole.COORDINATOR &&
          (
            normalizeDepartment(u.department) === userDepartment ||
            normalizeDepartment(u.department) === normalizeDepartment('Academic Affairs') ||
            normalizeDepartment(u.department) === normalizeDepartment('Student Welfare')
          )
      );
      setAvailableCoords(validCoords);

      const deptHods = allUsers.filter(
        u => u.role === UserRole.HOD && normalizeDepartment(u.department) === userDepartment
      );
      setAvailableHods(deptHods);

      if (deptHods.length === 1) setSelectedHod(deptHods[0].id);
    };

    void loadAuthorities();
  }, [user.department]);

  useEffect(() => {
    if (!viewingBonafide) return;
    const viewport = previewViewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const availableWidth = viewport.clientWidth || 0;
      if (!availableWidth) return;
      const nextScale = Math.min(1, availableWidth / A4_PREVIEW_BASE_WIDTH);
      setPreviewScale(prev => (Math.abs(prev - nextScale) > 0.002 ? nextScale : prev));
    };

    updateScale();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof window.ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateScale);
      resizeObserver.observe(viewport);
    }

    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', updateScale);

    return () => {
      window.removeEventListener('resize', updateScale);
      window.removeEventListener('orientationchange', updateScale);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [viewingBonafide]);

  const handleApply = (scholarship: Scholarship) => {
    setSelectedScholarship(scholarship);
    setIsApplyModalOpen(true);
  };

  const submitApplication = async () => {
    if (!selectedScholarship) return;
    if (!purpose.trim()) { notify("Please provide a reason.", "warning"); return; }
    if (!selectedTutor || !selectedCoord || !selectedHod) { notify("Incomplete routing info.", "warning"); return; }

    setIsSubmitting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const newApp: Application = {
        id: 'app-' + Math.random().toString(36).substr(2, 9),
        studentId: user.id,
        studentName: user.name,
        regNo: user.regNo || '',
        department: user.department,
        section: user.section || '',
        scholarshipId: selectedScholarship.id,
        scholarshipName: selectedScholarship.name,
        purpose: purpose,
        tutorId: selectedTutor,
        coordinatorId: selectedCoord,
        hodId: selectedHod,
        status: ApplicationStatus.PENDING_TUTOR,
        timestamp: Date.now(),
        approvalHistory: []
      };

      await db.addApplication(newApp);
      await refreshData();
      setShowSuccess(true);
      notify("Application routed to Class Tutor.", "success");

      setTimeout(() => {
        setShowSuccess(false);
        setIsApplyModalOpen(false);
        resetForm();
      }, 2000);
    } catch (err: any) {
      notify(err.message || "Submission failed.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedScholarship(null);
    setSelectedTutor('');
    setSelectedCoord('');
    if (availableHods.length > 1) setSelectedHod('');
    setPurpose('');
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

  const handleDownloadPDF = async () => {
    const element = document.getElementById('bonafide-content');
    if (!element || !viewingBonafide) return;

    setIsDownloading(true);
    const filename = `bonafide-certificate-${sanitizeFileSegment(viewingBonafide.regNo || 'student')}.pdf`;
    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdfSource = element.cloneNode(true) as HTMLElement;
    pdfSource.removeAttribute('id');
    pdfSource.style.width = `${A4_PREVIEW_BASE_WIDTH}px`;
    pdfSource.style.minHeight = `${A4_PREVIEW_BASE_HEIGHT}px`;
    pdfSource.style.maxWidth = `${A4_PREVIEW_BASE_WIDTH}px`;
    pdfSource.style.transform = 'none';
    pdfSource.style.transformOrigin = 'top left';
    pdfSource.style.position = 'fixed';
    pdfSource.style.left = '-99999px';
    pdfSource.style.top = '0';
    pdfSource.style.margin = '0';
    pdfSource.style.pointerEvents = 'none';
    pdfSource.style.zIndex = '-1';

    document.body.appendChild(pdfSource);

    try {
      if (typeof html2pdf === 'undefined') throw new Error('PDF generator is unavailable.');
      const dataUri = await html2pdf().set(opt).from(pdfSource).outputPdf('datauristring');
      if (!dataUri || typeof dataUri !== 'string') throw new Error('Unable to generate PDF.');

      if (Capacitor.isNativePlatform()) {
        const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
        const outputPath = `ScholarAxis/${filename}`;
        let savedToDocuments = false;

        try {
          const permission = await Filesystem.checkPermissions();
          if (permission?.publicStorage && permission.publicStorage !== 'granted') {
            await Filesystem.requestPermissions();
          }
        } catch {
          // iOS/web environments may not expose public storage permission state.
        }

        try {
          await Filesystem.writeFile({
            path: outputPath,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true
          });
          savedToDocuments = true;
        } catch {
          try {
            await Filesystem.writeFile({
              path: outputPath,
              data: base64Data,
              directory: Directory.Data,
              recursive: true
            });
          } catch {
            throw new Error('Unable to save PDF file on device.');
          }
        }

        notify(
          savedToDocuments
            ? `PDF saved to Documents/ScholarAxis as ${filename}`
            : `PDF saved to app storage as ${filename}`,
          'success'
        );
      } else {
        await html2pdf().set(opt).from(pdfSource).save();
        notify('Certificate downloaded successfully.', 'success');
      }
    } catch (err: any) {
      console.error(err);
      notify('Failed to generate PDF.', 'error');
    } finally {
      if (pdfSource.parentNode) {
        pdfSource.parentNode.removeChild(pdfSource);
      }
      setIsDownloading(false);
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  // --- PROGRESS TRACKER LOGIC ---
  const renderProgressTracker = (status: ApplicationStatus) => {
    if (status === ApplicationStatus.REJECTED) {
      return (
        <div className="mt-6 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl p-4 flex items-center gap-4 animate-fade-in">
          <div className="h-10 w-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
             <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-red-700 dark:text-red-400">Application Returned</h4>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">Your application was rejected by the reviewing authority. Please check notifications.</p>
          </div>
        </div>
      );
    }

    const stages = [
      { id: 1, label: 'Submitted', activeFor: [ApplicationStatus.PENDING_TUTOR, ApplicationStatus.PENDING_COORDINATOR, ApplicationStatus.PENDING_HOD, ApplicationStatus.APPROVED] },
      { id: 2, label: 'Tutor', activeFor: [ApplicationStatus.PENDING_COORDINATOR, ApplicationStatus.PENDING_HOD, ApplicationStatus.APPROVED] },
      { id: 3, label: 'Coord', activeFor: [ApplicationStatus.PENDING_HOD, ApplicationStatus.APPROVED] },
      { id: 4, label: 'HOD', activeFor: [ApplicationStatus.APPROVED] }
    ];

    // Determine current processing stage
    let currentProcessingStage = 0;
    if (status === ApplicationStatus.PENDING_TUTOR) currentProcessingStage = 2; // Tutor is processing
    else if (status === ApplicationStatus.PENDING_COORDINATOR) currentProcessingStage = 3; // Coordinator processing
    else if (status === ApplicationStatus.PENDING_HOD) currentProcessingStage = 4; // HOD processing
    else if (status === ApplicationStatus.APPROVED) currentProcessingStage = 5; // All done

    return (
      <div className="mt-6 relative">
        {/* Connecting Line Background */}
        <div className="absolute top-3.5 left-2 right-2 h-0.5 bg-slate-100 dark:bg-slate-800 -z-10"></div>
        
        {/* Connecting Line Progress */}
        <div 
          className="absolute top-3.5 left-2 h-0.5 bg-[#006837] transition-all duration-1000 -z-0"
          style={{ width: `${Math.min(((currentProcessingStage - 1) / 3) * 100, 100)}%` }}
        ></div>

        <div className="flex justify-between items-start">
          {stages.map((stage) => {
            const isCompleted = stage.activeFor.includes(status);
            const isCurrent = (stage.id === currentProcessingStage);

            return (
              <div key={stage.id} className="flex flex-col items-center group relative">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${
                  isCompleted 
                    ? 'bg-[#006837] border-[#006837] text-white shadow-lg shadow-green-900/20' 
                    : isCurrent 
                      ? 'bg-white dark:bg-slate-900 border-[#006837] text-[#006837] shadow-lg shadow-green-500/20 scale-110' 
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300'
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                  )}
                </div>
                <span className={`text-[10px] font-bold mt-2 uppercase tracking-wide transition-colors duration-300 ${
                  isCompleted || isCurrent ? 'text-slate-800 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'
                }`}>
                  {stage.label}
                </span>
                {isCurrent && (
                  <div className="absolute -bottom-4 px-2 py-0.5 bg-[#006837] text-white text-[9px] font-bold rounded-full animate-fade-in whitespace-nowrap hidden md:block">
                    In Review
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#020617] lg:flex-row transition-colors text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      
      {/* Sidebar (Desktop) */}
      <aside className="hidden lg:flex flex-col w-72 bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-800 shrink-0 z-20 h-full pt-safe">
        <div className="p-8 flex flex-col items-center border-b border-slate-100 dark:border-slate-800/50">
          <img src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" alt="Logo" className="w-24 h-auto mb-5" />
          <div className="text-center">
             <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">ScholarAxis</h1>
             <p className="text-xs font-semibold text-[#006837] uppercase tracking-wider mt-1">Student Portal</p>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-6 overflow-y-auto">
          <button onClick={() => setActiveTab('scholarships')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'scholarships' ? 'bg-[#006837] text-white font-semibold shadow-md shadow-green-900/10' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}>
            <LayoutDashboard className="mr-3 h-5 w-5" />Scholarships
          </button>
          <button onClick={() => setActiveTab('applications')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'applications' ? 'bg-[#006837] text-white font-semibold shadow-md shadow-green-900/10' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}>
            <FileText className="mr-3 h-5 w-5" />Applications
          </button>
          <button onClick={() => setActiveTab('academic')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${activeTab === 'academic' ? 'bg-[#006837] text-white font-semibold shadow-md shadow-green-900/10' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}>
            <BookOpen className="mr-3 h-5 w-5" />Profile
          </button>
        </nav>
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 mt-auto">
          <button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"><LogOut className="mr-3 h-4 w-4" />Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="app-header bg-white dark:bg-[#0f172a] px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 transition-all z-20">
          <div className="flex items-center space-x-4 min-w-0">
            <div className="h-10 w-10 bg-[#006837] rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-4 ring-green-50 dark:ring-green-900/20">
              {user.name[0]}
            </div>
            <div className="min-w-0 flex flex-col">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">{user.name}</h2>
              <p className="text-xs text-slate-500 font-medium truncate">{user.regNo}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={toggleTheme} className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
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
                     {notifications.length === 0 ? (
                       <div className="p-12 text-center flex flex-col items-center">
                         <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                            <Bell className="h-5 w-5 text-slate-300" />
                         </div>
                         <p className="text-sm font-medium text-slate-500">No new notifications</p>
                       </div>
                     ) : (
                       notifications.map(n => (
                         <div key={n.id} className={`p-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${n.status === 'unread' ? 'bg-green-50/40 dark:bg-green-900/10' : ''}`}>
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                              <span className="text-xs text-slate-400 font-medium">{new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">{n.message}</p>
                         </div>
                       ))
                     )}
                   </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar pb-24 lg:pb-10 app-content">
          {activeTab === 'scholarships' && (
            <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
              <div className="bg-[#006837] rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-lg">
                 <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                 <h2 className="text-3xl font-bold mb-3 tracking-tight relative z-10">Scholarship Programs</h2>
                 <p className="text-green-100 font-medium text-base relative z-10 max-w-xl leading-relaxed">Explore and apply for financial aid opportunities curated for your academic success at Sri Ramakrishna Engineering College.</p>
              </div>

              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white">Available Scholarships</h3>
                 <div className="bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 flex shadow-sm">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-slate-100 dark:bg-slate-700 text-[#006837] dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid className="h-4 w-4" /></button>
                    <button onClick={() => setViewMode('compact')} className={`p-2 rounded-lg transition-all ${viewMode === 'compact' ? 'bg-slate-100 dark:bg-slate-700 text-[#006837] dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}><List className="h-4 w-4" /></button>
                 </div>
              </div>

              <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
                {scholarships.map(sch => (
                  <div key={sch.id} className={`bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group flex ${viewMode === 'grid' ? 'flex-col p-6 rounded-2xl' : 'flex-row items-center p-6 rounded-xl'}`}>
                    <div className={`${viewMode === 'grid' ? 'mb-6' : 'mr-6'} shrink-0`}>
                       <div className={`h-14 w-14 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center text-[#006837] group-hover:bg-[#006837] group-hover:text-white transition-colors duration-300`}>
                        <Landmark className="h-7 w-7" />
                       </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className={`font-bold text-slate-900 dark:text-white ${viewMode === 'grid' ? 'text-lg leading-snug' : 'text-base'}`}>{sch.name}</h3>
                        {viewMode === 'grid' && <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0 ml-2">{sch.type}</span>}
                      </div>
                      {viewMode === 'grid' && <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 line-clamp-2 leading-relaxed flex-1">{sch.description}</p>}
                      <div className={`flex justify-end items-center ${viewMode === 'grid' ? 'mt-auto pt-6 border-t border-slate-100 dark:border-slate-800' : ''}`}>
                         <button onClick={() => handleApply(sch)} className={`bg-[#006837] text-white font-semibold uppercase tracking-wide hover:bg-[#00522a] active:scale-95 transition-all shadow-lg shadow-green-900/20 ${viewMode === 'grid' ? 'px-6 py-3 rounded-xl text-xs' : 'px-5 py-2.5 rounded-lg text-xs'}`}>Apply Now</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'applications' && (
            <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
              <div className="flex items-center justify-between">
                 <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Submission History</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                {applications.length === 0 ? (
                  <div className="py-24 bg-white dark:bg-[#0f172a] rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                    <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-slate-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Applications Yet</h4>
                    <p className="text-sm text-slate-500 max-w-xs">You haven't applied for any scholarships. Visit the feed to get started.</p>
                  </div>
                ) : (
                  [...applications].sort((a,b) => b.timestamp - a.timestamp).map(app => (
                      <div key={app.id} className="bg-white dark:bg-[#0f172a] p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 hover:border-green-500/30 transition-all duration-300 group">
                        <div className="flex flex-col gap-6">
                          <div className="flex justify-between items-start">
                             <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-xs font-bold text-[#006837] uppercase tracking-wider bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md">ID: {app.id.slice(-6).toUpperCase()}</span>
                                    <span className="text-xs font-medium text-slate-400 flex items-center"><Clock className="h-3 w-3 mr-1" /> {new Date(app.timestamp).toLocaleDateString()}</span>
                                </div>
                                <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{app.scholarshipName}</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{app.department}</p>
                             </div>
                             {app.status === ApplicationStatus.APPROVED && (
                                  <button onClick={() => setViewingBonafide(app)} className="hidden sm:flex items-center px-5 py-2.5 bg-[#006837] text-white rounded-lg font-semibold text-xs uppercase tracking-wide hover:bg-[#00522a] transition-all shadow-md active:scale-95 shrink-0">
                                    <Download className="h-4 w-4 mr-2" /> Download Certificate
                                  </button>
                             )}
                          </div>
                          
                          {/* Progress Tracker */}
                          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                             {renderProgressTracker(app.status)}
                          </div>

                          {/* Mobile Download Button */}
                           {app.status === ApplicationStatus.APPROVED && (
                              <button onClick={() => setViewingBonafide(app)} className="sm:hidden w-full flex items-center justify-center px-5 py-3 bg-[#006837] text-white rounded-lg font-semibold text-xs uppercase tracking-wide hover:bg-[#00522a] transition-all shadow-md active:scale-95">
                                <Download className="h-4 w-4 mr-2" /> Download Certificate
                              </button>
                           )}
                        </div>
                      </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
               <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Student Profile</h3>
               
               <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="h-32 bg-gradient-to-r from-[#006837] to-[#00a859]"></div>
                  <div className="px-8 pb-8 relative">
                     <div className="flex flex-col md:flex-row items-start md:items-end -mt-12 mb-6 gap-6">
                        <div className="h-32 w-32 rounded-3xl bg-white dark:bg-slate-900 p-1.5 shadow-xl">
                           <div className="h-full w-full bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-300">
                              <UserIcon className="h-16 w-16" />
                           </div>
                        </div>
                        <div className="flex-1 mb-2">
                           <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{user.name}</h2>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-semibold text-[#006837] uppercase tracking-wide">Student</span>
                              <span className="h-1 w-1 bg-slate-300 rounded-full"></span>
                              <span className="text-sm text-slate-500">{user.regNo}</span>
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
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Semester</label>
                           <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{user.semester ? `Semester ${user.semester}` : 'N/A'}</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 flex justify-around p-2 pb-safe z-50">
          <button onClick={() => setActiveTab('scholarships')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${activeTab === 'scholarships' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <LayoutDashboard className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Feed</span>
          </button>
          <button onClick={() => setActiveTab('applications')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${activeTab === 'applications' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <FileText className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">History</span>
          </button>
          <button onClick={() => setActiveTab('academic')} className={`flex flex-col items-center p-3 rounded-xl transition-all ${activeTab === 'academic' ? 'text-[#006837] bg-green-50 dark:bg-green-900/20' : 'text-slate-400'}`}>
             <BookOpen className="h-6 w-6" />
             <span className="text-[10px] font-bold mt-1">Profile</span>
          </button>
          <button onClick={onLogout} className="flex flex-col items-center p-3 rounded-xl transition-all text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10">
              <LogOut className="h-6 w-6" />
              <span className="text-[10px] font-bold mt-1">Logout</span>
          </button>
        </nav>
      </main>

      {/* APPLY MODAL */}
      {isApplyModalOpen && selectedScholarship && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90dvh]">
             {showSuccess ? (
              <div className="p-16 flex flex-col items-center justify-center animate-fade-in text-center">
                <div className="h-20 w-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 mb-6">
                    <CheckCircle2 className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Submitted!</h3>
                <p className="text-slate-500 font-medium text-sm">Your application has been successfully routed to your Class Tutor for review.</p>
              </div>
            ) : (
              <>
                 <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Apply for Scholarship</h3>
                  <button onClick={() => setIsApplyModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="h-5 w-5 text-slate-500" /></button>
                </div>
                <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                  {/* Validation Error Message */}
                  {(availableHods.length === 0 || availableTutors.length === 0) && (
                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl flex items-start gap-3 border border-red-100 dark:border-red-800">
                      <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-red-700 dark:text-red-400">Routing Configuration Error</p>
                        <p className="text-xs text-red-600/80 mt-1">Unable to locate Tutor or HOD for your department. Please contact the administrator.</p>
                      </div>
                    </div>
                  )}

                  <div className={`p-5 rounded-2xl border flex items-center gap-4 ${selectedScholarship.type === ScholarshipType.GOVERNMENT ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30' : 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800/30'}`}>
                    <div className="flex-1">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{selectedScholarship.name}</h4>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Statement of Purpose</label>
                     <textarea required value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm font-medium focus:border-[#006837] focus:ring-1 focus:ring-[#006837] outline-none transition-all resize-none h-32" placeholder="Briefly explain why you need this scholarship..." />
                  </div>

                  <div className="space-y-4">
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">Class Tutor</label>
                        <select required value={selectedTutor} onChange={(e) => setSelectedTutor(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm font-semibold focus:border-[#006837] outline-none appearance-none">
                            <option value="">Select your tutor...</option>
                            {availableTutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">Academic Coordinator</label>
                        <select required value={selectedCoord} onChange={(e) => setSelectedCoord(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm font-semibold focus:border-[#006837] outline-none appearance-none">
                            <option value="">Select coordinator...</option>
                            {availableCoords.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">Head of Department</label>
                        <select required value={selectedHod} onChange={(e) => setSelectedHod(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm font-semibold outline-none appearance-none cursor-pointer" disabled={availableHods.length === 1}>
                            {availableHods.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                        </select>
                     </div>
                  </div>
                </div>
                 <div className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
                  <button onClick={submitApplication} disabled={isSubmitting || availableHods.length === 0} className="w-full py-4 bg-[#006837] text-white rounded-xl font-bold shadow-lg shadow-green-900/20 hover:bg-[#00522a] transition-all text-sm uppercase tracking-wider flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
                    {isSubmitting ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <>Submit Application</>}
                  </button>
                </div>
              </>
             )}
          </div>
        </div>
      )}

      {/* BONAFIDE CERTIFICATE OVERLAY */}
      {viewingBonafide && (
        <div className="fixed left-0 right-0 bottom-0 top-safe bg-slate-950/90 backdrop-blur-md z-[100] flex flex-col items-center px-3 sm:px-4 pb-8 overflow-y-auto">
           <div className="w-full max-w-[800px] flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-5 mt-6 sm:mt-10 print-hidden shrink-0">
              <div className="flex items-center gap-3 text-white">
                 <div className="h-10 w-10 bg-[#006837] rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                 </div>
                 <h3 className="text-lg font-bold">Certificate Preview</h3>
              </div>
              <div className="flex flex-wrap gap-3 sm:justify-end">
                <button onClick={handleDownloadPDF} disabled={isDownloading} className="bg-[#006837] hover:bg-[#00522a] text-white px-5 sm:px-6 py-2.5 rounded-lg flex items-center justify-center font-bold text-sm uppercase tracking-wide transition-all shadow-lg disabled:opacity-70 disabled:cursor-wait min-w-[155px]">
                   {isDownloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                   {isDownloading ? 'Generating...' : 'Download PDF'}
                </button>
                <button onClick={() => setViewingBonafide(null)} className="bg-white/10 text-white px-5 sm:px-6 py-2.5 rounded-lg hover:bg-white/20 transition-all font-bold text-sm uppercase tracking-wide min-w-[110px]">Close</button>
              </div>
           </div>

           <div ref={previewViewportRef} className="w-full max-w-[800px] mx-auto mb-10 shrink-0">
            <div className="relative w-full max-w-full mx-auto aspect-[210/297] overflow-hidden">
            <div
              id="bonafide-content"
              className="bg-white text-black shadow-2xl relative overflow-hidden print:shadow-none flex flex-col font-serif"
              style={{
                width: `${A4_PREVIEW_BASE_WIDTH}px`,
                minHeight: `${A4_PREVIEW_BASE_HEIGHT}px`,
                padding: '15mm',
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left'
              }}
            >
               {/* Header */}
               <div className="flex justify-between items-start mb-8">
                   <div className="w-24 shrink-0 pt-2">
                      <img src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" alt="SREC" className="w-full h-auto object-contain" />
                  </div>
                  <div className="text-center px-4 flex-1">
                      <h1 className="text-xl font-bold uppercase tracking-wide leading-relaxed text-black">Sri Ramakrishna Engineering College</h1>
                      <p className="text-xs font-bold uppercase tracking-widest mt-1 text-black">(An Autonomous Institution)</p>
                      <p className="text-xs mt-1 text-black">Vattamalaipalayam, N.G.G.O. Colony Post, Coimbatore - 641 022</p>
                      <p className="text-[10px] mt-1 text-black italic">Affiliated to Anna University, Chennai | Approved by AICTE, New Delhi</p>
                  </div>
                  <div className="w-20 shrink-0 pt-2 flex justify-end">
                      <img src="https://upload.wikimedia.org/wikipedia/en/4/49/Anna_University_Logo.svg" alt="AU" className="w-full h-auto object-contain" />
                  </div>
              </div>

              {/* Title */}
              <div className="text-center mb-10">
                  <h2 className="text-2xl font-bold uppercase underline underline-offset-4 tracking-wider text-black">Bonafide Certificate</h2>
              </div>

              {/* Department Header */}
              <div className="text-center mb-8">
                  <div className="flex justify-between items-center text-sm font-bold text-black mb-4 px-2">
                     <span>Ref. No: SREC/BON/2024/{viewingBonafide.id.slice(-6).toUpperCase()}</span>
                     <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
                  </div>
                  <p className="text-lg text-black">Department of <span className="underline font-bold uppercase">{viewingBonafide.department}</span></p>
                  <p className="text-sm font-bold uppercase mt-2 text-black">Scholarship Application - {new Date().getFullYear()}</p>
              </div>

              {/* Body */}
              <div className="px-4 text-justify leading-[2.5] text-lg text-black">
                  <p className="mb-8">
                      This is to certify that <span className="font-bold uppercase">Mr./Ms. {viewingBonafide.studentName}</span> 
                      &nbsp;(Register No. <span className="font-bold">{viewingBonafide.regNo}</span>) is a bonafide student of 
                      this Institution, currently pursuing <span className="font-bold">B.E./B.Tech</span> degree in the Department of <span className="font-bold">{viewingBonafide.department}</span> 
                      during the academic year <span className="font-bold">{new Date().getFullYear()}-{new Date().getFullYear()+1}</span>.
                  </p>
                  <p className="mb-8">
                      He/She has applied for the <span className="font-bold">"{viewingBonafide.scholarshipName}"</span>. 
                      This certificate is issued for the purpose of enabling him/her to apply for the said scholarship. 
                      It is further certified that he/she is not in receipt of any other scholarship from this institution for the current academic year.
                  </p>
                  <p>
                      His/Her character and conduct are certified to be <span className="font-bold">GOOD</span> during the period of study in this college.
                  </p>
              </div>

              {/* Footer / Signatures */}
              <div className="mt-auto">
                  <div className="flex justify-between items-end mb-16 px-4">
                      <div className="text-center w-1/3">
                          <div className="border-t border-dotted border-black mb-2"></div>
                          <p className="font-bold text-black text-sm">Head of the Department</p>
                      </div>
                      <div className="text-center w-1/3">
                          <div className="border-t border-dotted border-black mb-2"></div>
                          <p className="font-bold text-black text-sm">Staff In-Charge / Guide</p>
                      </div>
                  </div>

                  <div className="flex justify-center items-center mt-4">
                       <div className="text-center w-1/3">
                          <div className="border-t border-dotted border-black mb-2"></div>
                          <p className="font-bold uppercase text-sm text-black">Principal</p>
                       </div>
                  </div>
                  
                  <div className="text-center mt-8 pt-4 border-t border-slate-300">
                     <p className="text-[10px] text-black">This is a system generated certificate, signature is not required for digital submission.</p>
                  </div>
               </div>
            </div>
            </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;

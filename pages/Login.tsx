
import React, { useState, useMemo } from 'react';
import { User, UserRole } from '../types';
import { db, AuthError } from '../services/db';
import { Sun, Moon, ShieldCheck, User as UserIcon, GraduationCap, Users, UserCog, Key, Settings, Sparkles, ChevronLeft, ArrowRight, AlertCircle, Eye, EyeOff, Phone } from 'lucide-react';
import { NotificationType } from '../components/NotificationToast';

interface LoginProps {
  onLogin: (user: User) => void;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  notify: (message: string, type: NotificationType) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, toggleTheme, theme, notify }) => {
  const [step, setStep] = useState<0 | 1>(0); // 0: Role Selection, 1: Credentials
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('');
  const [joinYear, setJoinYear] = useState('');
  const [regNo, setRegNo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roles = useMemo(() => [
    { id: UserRole.STUDENT, label: 'Student', icon: GraduationCap, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-100 dark:border-green-800/30' },
    { id: UserRole.TUTOR, label: 'Faculty Tutor', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-100 dark:border-blue-800/30' },
    { id: UserRole.COORDINATOR, label: 'Academic Coordinator', icon: ShieldCheck, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-100 dark:border-purple-800/30' },
    { id: UserRole.HOD, label: 'Head of Department', icon: UserCog, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-100 dark:border-orange-800/30' },
    { id: UserRole.ADMIN, label: 'Institutional Admin', icon: Settings, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-100 dark:border-red-800/30' },
  ], []);

  const resetAuthFields = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setMobileNumber('');
    setDepartment('');
    setSemester('');
    setJoinYear('');
    setRegNo('');
    setShowPassword(false);
    setError('');
  };

  const semesterOptions = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8], []);
  const joinYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, idx) => String(currentYear - idx));
  }, []);

  const currentRoleData = roles.find(r => r.id === selectedRole);
  const canRegisterSelectedRole = selectedRole !== null && selectedRole !== UserRole.ADMIN;

  const handleRoleSelect = (role: UserRole) => {
    setAuthMode('login');
    setDepartment('');
    resetAuthFields();
    setSelectedRole(role);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      if (!selectedRole) throw new Error("Role selection is required.");

      if (authMode === 'register') {
        if (selectedRole === UserRole.ADMIN) {
          throw new Error('Admin self-registration is disabled.');
        }

        const user = await db.registerUser({
          name: fullName,
          role: selectedRole,
          department,
          email,
          password,
          mobileNumber,
          semester: selectedRole === UserRole.STUDENT ? (semester ? Number(semester) : undefined) : undefined,
          joinYear: selectedRole !== UserRole.STUDENT ? (joinYear || undefined) : undefined,
          regNo: selectedRole === UserRole.STUDENT ? regNo : undefined
        });
        notify('Registration successful.', 'success');
        onLogin(user);
      } else {
        const user = await db.authenticate(email, password, selectedRole);
        onLogin(user);
      }
    } catch (err) {
      const message =
        err instanceof AuthError
          ? err.message
          : err instanceof Error && err.message
            ? err.message
            : "An unexpected error occurred. Please try again later.";
      setError(message);
      notify(authMode === 'register' ? 'Registration failed.' : 'Authentication failed.', "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 transition-colors bg-slate-50 dark:bg-slate-950 overflow-y-auto overflow-x-hidden text-slate-900 dark:text-slate-100 font-sans">
      {/* Dynamic Theme Toggle */}
      <button 
        onClick={toggleTheme}
        className="fixed top-[calc(1.5rem+var(--app-safe-top,0px))] right-6 p-2.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg text-slate-500 dark:text-slate-400 z-[60] transition-all hover:bg-slate-50 active:scale-95"
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      <div className="max-w-xl md:max-w-2xl w-full animate-fade-in my-auto relative z-10">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-8 md:p-12 rounded-3xl shadow-2xl border border-white/50 dark:border-slate-800/50 relative overflow-hidden">
          
          {/* Brand Header */}
          <div className="text-center mb-10 relative z-10">
            <div className="mx-auto mb-6 w-24 md:w-32 flex items-center justify-center animate-float">
              <img 
                src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" 
                alt="SREC Logo" 
                className="w-full h-auto object-contain drop-shadow-sm"
              />
            </div>
            <div className="flex flex-col items-center">
               <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">ScholarAxis</h1>
               <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest mt-2">Sri Ramakrishna Engineering College</p>
            </div>
          </div>

          {step === 0 ? (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-8">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Identify Your Role</h3>
                <p className="text-sm text-slate-500 font-medium">Select an entry point to proceed</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id)}
                    className="flex items-center p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#006837] hover:ring-1 hover:ring-[#006837] transition-all group text-left relative overflow-hidden shadow-sm hover:shadow-md"
                  >
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center mr-4 transition-transform group-hover:scale-110 ${role.bg} ${role.color} shrink-0`}>
                      <role.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Role Type</p>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#006837] transition-colors truncate">{role.label}</h4>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#006837] group-hover:translate-x-1 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              <button 
                onClick={() => {
                  setStep(0);
                  setSelectedRole(null);
                  setAuthMode('login');
                  resetAuthFields();
                }}
                className="flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-[#006837] transition-colors mb-2 group active:scale-95"
              >
                <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                Return to Selection
              </button>

              {canRegisterSelectedRole && (
                <div className="flex justify-end -mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setAuthMode(prev => prev === 'login' ? 'register' : 'login');
                    }}
                    className="text-xs font-bold uppercase tracking-wide text-[#006837] hover:text-[#00522a] transition-colors"
                  >
                    {authMode === 'login' ? 'New user? Register' : 'Already registered? Sign in'}
                  </button>
                </div>
              )}

              <div className="flex items-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 mb-6">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center mr-4 shadow-sm shrink-0 ${currentRoleData?.bg} ${currentRoleData?.color}`}>
                  {currentRoleData && <currentRoleData.icon className="h-6 w-6" />}
                </div>
                <div className="flex-1 min-w-0">
                   <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                     {authMode === 'register' ? `Register as ${currentRoleData?.label}` : `Verifying ${currentRoleData?.label}`}
                   </h3>
                   <p className="text-xs font-semibold text-[#006837] uppercase tracking-wide mt-1">
                     {authMode === 'register' ? 'New Account Enrollment' : 'Authorized Access Protocol'}
                   </p>
                </div>
              </div>

              {selectedRole === UserRole.ADMIN && (
                <div className="bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 p-4 rounded-xl text-xs font-semibold border border-amber-100 dark:border-amber-900/20">
                  Admin self-registration is disabled. Use existing System Admin credentials.
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 p-4 rounded-xl text-xs font-semibold border border-red-100 dark:border-red-900/20 flex items-start animate-fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0 mr-2 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                {authMode === 'register' && (
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Full Name</label>
                      <div className="relative group">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-[#006837] transition-colors" />
                        <input
                          type="text"
                          required={authMode === 'register'}
                          className={`w-full pl-11 pr-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                          placeholder="Full legal name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Department</label>
                      <input
                        type="text"
                        required={authMode === 'register'}
                        className={`w-full px-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                        placeholder="Type your department name"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Mobile Number</label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-[#006837] transition-colors" />
                        <input
                          type="tel"
                          required={authMode === 'register'}
                          className={`w-full pl-11 pr-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                          placeholder="9876543210"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                        />
                      </div>
                    </div>

                    {selectedRole === UserRole.STUDENT ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Semester</label>
                          <select
                            required={authMode === 'register'}
                            value={semester}
                            onChange={(e) => setSemester(e.target.value)}
                            className={`w-full px-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                          >
                            <option value="">Select semester</option>
                            {semesterOptions.map(sem => (
                              <option key={sem} value={sem}>{`Semester ${sem}`}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Register Number</label>
                          <div className="relative group">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-[#006837] transition-colors" />
                            <input
                              type="text"
                              required={authMode === 'register'}
                              className={`w-full pl-11 pr-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-none font-medium text-sm shadow-sm uppercase ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                              placeholder="7178..."
                              value={regNo}
                              onChange={(e) => setRegNo(e.target.value)}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-1 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Joining Year</label>
                          <select
                            required={authMode === 'register'}
                            value={joinYear}
                            onChange={(e) => setJoinYear(e.target.value)}
                            className={`w-full px-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                          >
                            <option value="">Select year</option>
                            {joinYearOptions.map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                 
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Institutional ID</label>
                    <div className="relative group">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-[#006837] transition-colors" />
                      <input
                        type="email"
                        required
                        className={`w-full pl-11 pr-4 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                        placeholder="id@srec.ac.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Access Key</label>
                    <div className="relative group">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-[#006837] transition-colors" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        className={`w-full pl-11 pr-12 py-3.5 rounded-xl border bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-all outline-none font-medium text-sm shadow-sm ${error ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700 focus:border-[#006837] focus:ring-1 focus:ring-[#006837]'}`}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#006837] transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-[#006837] text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-green-900/10 hover:bg-[#00522a] hover:shadow-xl hover:shadow-green-900/20 transform active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    authMode === 'register' ? 'Create Account' : 'Verify Access'
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Footer Subtext */}
          <div className="mt-10 text-center relative z-10">
            <p className="text-slate-400 dark:text-slate-600 text-[10px] font-bold uppercase tracking-widest">
              Digital Campus Infrastructure Node • SREC Secure Gateway
            </p>
          </div>
        </div>
      </div>

      {/* Background Cinematic Texture */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
         <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#006837]/5 to-transparent"></div>
         <div className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-tl from-[#f7941d]/5 to-transparent"></div>
      </div>
    </div>
  );
};

export default Login;

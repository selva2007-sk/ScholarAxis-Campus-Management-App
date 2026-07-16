
import React from 'react';

const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-950 flex flex-col items-center justify-center z-[9999] overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-4xl pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#006837]/10 via-transparent to-[#f7941d]/10 rounded-full blur-[120px] animate-slow-pulse"></div>
      </div>

      <div className="relative flex flex-col items-center">
        {/* Animated Big Logo */}
        <div className="animate-float mb-10 relative group">
          {/* Subtle Glow Ring */}
          <div className="absolute -inset-8 bg-gradient-to-tr from-[#006837]/20 to-[#f7941d]/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
          
          <img 
            src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" 
            alt="SREC Institutional Logo" 
            className="w-56 h-auto object-contain relative z-10 drop-shadow-xl transition-transform duration-1000"
          />
        </div>
        
        {/* Institutional Branding Reveal */}
        <div className="text-center space-y-4 relative z-10 animate-reveal">
          <div className="flex flex-col items-center">
            <h2 className="text-4xl font-bold text-[#006837] dark:text-white tracking-tight mb-2">
              SREC
            </h2>
            <div className="h-1 w-16 bg-gradient-to-r from-[#006837] via-[#f7941d] to-[#006837] rounded-full mb-3"></div>
            <p className="text-[#006837] dark:text-green-500 font-bold uppercase tracking-widest text-sm">
              ScholarAxis
            </p>
          </div>
          
          <div className="pt-4 max-w-xs mx-auto">
             <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider leading-relaxed">
               Sri Ramakrishna Engineering College
             </p>
             <p className="text-slate-400 dark:text-slate-600 text-[10px] font-medium uppercase tracking-wide mt-1">
               Autonomous • Coimbatore
             </p>
          </div>
        </div>

        {/* Cinematic Loading Progress Bar */}
        <div className="mt-16 w-48 h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden relative">
          <div className="absolute top-0 h-full bg-gradient-to-r from-[#006837] to-[#f7941d] animate-progress rounded-full"></div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-[calc(3rem+var(--app-safe-bottom,0px))] left-0 w-full text-center">
        <p className="text-slate-400 dark:text-slate-600 text-[10px] font-bold uppercase tracking-widest animate-pulse">
          Digital Campus Infrastructure
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;

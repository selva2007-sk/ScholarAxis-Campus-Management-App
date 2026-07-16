
import React from 'react';
import { Globe, Linkedin, Twitter, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';

const AppFooter: React.FC = () => {
  return (
    <footer className="mt-12 pt-12 pb-8 border-t border-slate-100 dark:border-slate-800 animate-fade-in font-sans">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <img src="https://srec.ac.in/themes/frontend/images/SRECLoGo_v3.svg" alt="SREC" className="h-8 w-auto" />
            <div>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm leading-tight uppercase">SREC ScholarAxis</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Institutional Infrastructure</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs font-medium">
            Sri Ramakrishna Engineering College (SREC) is an autonomous institution committed to academic excellence and student empowerment through digital innovation.
          </p>
          <div className="flex items-center space-x-3">
            <a href="#" className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-[#006837] transition-colors"><Twitter className="h-4 w-4" /></a>
            <a href="#" className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-[#006837] transition-colors"><Linkedin className="h-4 w-4" /></a>
            <a href="#" className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-[#006837] transition-colors"><Globe className="h-4 w-4" /></a>
          </div>
        </div>

        <div className="space-y-4">
          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Support Node</h5>
          <ul className="space-y-3">
            <li className="flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Phone className="h-3.5 w-3.5 mr-2.5 text-[#006837]" />
              0422 2460088 / 2461588
            </li>
            <li className="flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Mail className="h-3.5 w-3.5 mr-2.5 text-[#006837]" />
              scholarships@srec.ac.in
            </li>
            <li className="flex items-start text-xs font-semibold text-slate-600 dark:text-slate-300">
              <MapPin className="h-3.5 w-3.5 mr-2.5 mt-0.5 text-[#006837] shrink-0" />
              NGGO Colony Post, Vattamalaipalayam, Coimbatore - 641022
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance</h5>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-3 mb-3">
              <ShieldCheck className="h-5 w-5 text-[#006837]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">ISO 9001:2015 Certified</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal font-medium">
              All data processed through ScholarAxis is encrypted and maintained according to institutional privacy standards and UGC guidelines.
            </p>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-slate-100 dark:border-slate-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          &copy; {new Date().getFullYear()} SREC Coimbatore. All Rights Reserved.
        </p>
        <div className="flex items-center space-x-6">
          <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Privacy Policy</a>
          <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Terms of Use</a>
          <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">System Status</a>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;


import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { TimesheetPeriod } from '../types';
import { History, CheckCircle, Clock, Send, Loader2 } from 'lucide-react';

interface MyStatusWidgetProps {
  userId: string;
  onUpdate?: () => void; // Trigger to refresh parent data if needed
}

export const MyStatusWidget: React.FC<MyStatusWidgetProps> = ({ userId, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [periodStatus, setPeriodStatus] = useState<TimesheetPeriod | null>(null);
  const [periodHistory, setPeriodHistory] = useState<TimesheetPeriod[]>([]);
  const user = store.getCurrentUser();

  const loadStatus = async () => {
    setLoading(true);
    const today = new Date();
    const [status, history] = await Promise.all([
        store.getPeriodStatus(userId, today.getFullYear(), today.getMonth()),
        store.getLastPeriods(userId)
    ]);
    setPeriodStatus(status);
    setPeriodHistory(history);
    setLoading(false);
  };

  useEffect(() => {
    if (userId) loadStatus();
  }, [userId]);

  const handleSubmitPeriod = async (year: number, month: number) => {
      const dateName = new Date(year, month, 1).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
      if (!window.confirm(`Deseja fechar o mês de ${dateName} e enviar para aprovação?`)) return;
      
      await store.submitPeriod(userId, year, month, user?.managerId);
      await loadStatus();
      if(onUpdate) onUpdate();
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-6">
        {/* Current Status Card */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 rounded-xl text-white shadow-lg">
            <h3 className="text-lg font-bold mb-2">Mês Atual</h3>
            <div className="flex items-center justify-between gap-2 mb-4">
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                    periodStatus?.status === 'APPROVED' ? 'bg-green-400 text-green-900' : 
                    periodStatus?.status === 'SUBMITTED' ? 'bg-amber-400 text-amber-900' :
                    periodStatus?.status === 'REJECTED' ? 'bg-red-400 text-red-900' :
                    'bg-white/20 text-white'
                }`}>
                    {periodStatus?.status === 'OPEN' ? 'Em Aberto' : 
                     periodStatus?.status === 'SUBMITTED' ? 'Em Análise' :
                     periodStatus?.status === 'REJECTED' ? 'Rejeitado' : 'Aprovado'}
                </span>
                
                {/* Submit button for Current Month directly in the card */}
                {(periodStatus?.status === 'OPEN' || periodStatus?.status === 'REJECTED') && (
                    <button 
                        onClick={() => handleSubmitPeriod(periodStatus.year, periodStatus.month)}
                        className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Enviar Mês Atual"
                    >
                        <Send size={12} /> Enviar
                    </button>
                )}
            </div>
            <p className="text-brand-50 text-sm mb-4">
                {periodStatus?.status === 'OPEN' ? 'Lance suas horas diariamente. Ao final do mês, envie para aprovação.' :
                 periodStatus?.status === 'SUBMITTED' ? 'Seu gestor está analisando seus lançamentos.' :
                 periodStatus?.status === 'REJECTED' ? 'Atenção: Verifique correções solicitadas.' :
                 'Ciclo encerrado.'}
            </p>
            {periodStatus?.status === 'REJECTED' && (
                 <div className="bg-red-500/20 p-3 rounded text-xs text-red-100 mb-2 border border-red-500/30">
                     <strong>Motivo:</strong> {periodStatus.rejectionReason}
                 </div>
            )}
        </div>

        {/* History List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <History size={18} className="text-slate-500"/>
                <h3 className="font-semibold text-slate-700">Histórico de Fechamentos</h3>
            </div>
            <div className="divide-y divide-gray-100">
                {periodHistory.map((ph, idx) => {
                    const d = new Date(ph.year, ph.month, 1);
                    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                    
                    return (
                        <div key={`${ph.year}-${ph.month}`} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div>
                                <p className="text-sm font-bold text-slate-800 capitalize">{label}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className={`w-2 h-2 rounded-full ${
                                        ph.status === 'APPROVED' ? 'bg-green-500' :
                                        ph.status === 'SUBMITTED' ? 'bg-amber-500' :
                                        ph.status === 'REJECTED' ? 'bg-red-500' : 'bg-slate-300'
                                    }`} />
                                    <span className="text-xs text-slate-500">
                                        {ph.status === 'OPEN' ? 'Aberto' : 
                                         ph.status === 'SUBMITTED' ? 'Enviado' :
                                         ph.status === 'REJECTED' ? 'Devolvido' : 'Aprovado'}
                                    </span>
                                </div>
                                {ph.status === 'REJECTED' && (
                                    <p className="text-[10px] text-red-500 mt-1 max-w-[150px] truncate" title={ph.rejectionReason}>
                                        {ph.rejectionReason}
                                    </p>
                                )}
                            </div>

                            {/* Action Button: If Open/Rejected, allow submit */}
                            {(ph.status === 'OPEN' || ph.status === 'REJECTED') && (
                                <button 
                                    onClick={() => handleSubmitPeriod(ph.year, ph.month)}
                                    className="text-xs bg-white border border-slate-200 hover:border-brand-500 hover:text-brand-600 text-slate-500 px-3 py-1.5 rounded transition-colors"
                                    title="Encerrar Mês"
                                >
                                    Enviar
                                </button>
                            )}
                            {ph.status === 'SUBMITTED' && (
                                 <span className="text-slate-300"><Clock size={16} /></span>
                            )}
                            {ph.status === 'APPROVED' && (
                                 <span className="text-green-500"><CheckCircle size={16} /></span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );
};

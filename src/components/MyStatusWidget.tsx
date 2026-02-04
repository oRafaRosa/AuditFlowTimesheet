

import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { TimesheetPeriod, formatHours, User } from '../types';
import { History, CheckCircle, Clock, Send, Loader2, AlertCircle, Users } from 'lucide-react';

const parseLocalDate = (dateStr: string) => new Date(`${dateStr}T00:00:00`);

interface MyStatusWidgetProps {
  userId: string;
    onUpdate?: () => void; // gatilho pra atualizar o pai se precisar
}

export const MyStatusWidget: React.FC<MyStatusWidgetProps> = ({ userId, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [periodStatus, setPeriodStatus] = useState<TimesheetPeriod | null>(null);
  const [periodHistory, setPeriodHistory] = useState<TimesheetPeriod[]>([]);
  const [delegatedManagerName, setDelegatedManagerName] = useState<string | null>(null);
  const user = store.getCurrentUser();

  const loadStatus = async () => {
    setLoading(true);
    const today = new Date();
    const [status, history, users] = await Promise.all([
        store.getPeriodStatus(userId, today.getFullYear(), today.getMonth()),
        store.getLastPeriods(userId),
        store.getUsers()
    ]);
    setPeriodStatus(status);
    setPeriodHistory(history);
    
    // checa se o gestor do user delegou pra outra pessoa
    if (user) {
      const currentUserData = users.find(u => u.id === userId);
      if (currentUserData?.managerId) {
        const userManager = users.find(u => u.id === currentUserData.managerId);
        if (userManager?.delegatedManagerId) {
          const delegatedManager = users.find(u => u.id === userManager.delegatedManagerId);
          setDelegatedManagerName(delegatedManager?.name || null);
        } else {
          setDelegatedManagerName(null);
        }
      }
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (userId) loadStatus();
  }, [userId]);

  const validateAndSubmit = async (year: number, month: number) => {
      setProcessing(true);
      const dateName = new Date(year, month, 1).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});

      try {
        // 1. pega stats pra validar
        const [allEntries, expectedHours] = await Promise.all([
            store.getEntries(userId),
            store.getExpectedHours(year, month)
        ]);

        const periodEntries = allEntries.filter(e => {
            const d = parseLocalDate(e.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        const totalLogged = periodEntries.reduce((acc, curr) => acc + curr.hours, 0);
        const diff = expectedHours - totalLogged;
        const TOLERANCE = 40; // tolerância de 40h

        // 2. regra do jogo
        const today = new Date();
        const lastDayOfMonth = new Date(year, month + 1, 0); // último dia do mês alvo
        
        const isPastMonth = today > lastDayOfMonth;
        
        // checa se tá nos últimos 7 dias do mês
        const sevenDaysBeforeEnd = new Date(lastDayOfMonth);
        sevenDaysBeforeEnd.setDate(lastDayOfMonth.getDate() - 7);
        
        // só olha "últimos 7 dias" se for o mês certo
        const isLastDays = (today >= sevenDaysBeforeEnd) && (today.getMonth() === month) && (today.getFullYear() === year);

        // checa se as horas tão ok (approx msm)
        const isComplete = totalLogged >= (expectedHours - TOLERANCE);

        // 3. validação
        if (!isPastMonth && !isLastDays && !isComplete) {
            alert(`Você não pode enviar este mês ainda.\n\nRegras para envio:\n1. O mês já deve ter fechado; OU\n2. Estar nos últimos 7 dias do mês; OU\n3. Ter lançado o total próximo do esperado (Tolerância de 40h).\n\nEsperado: ${expectedHours}h\nLançado: ${formatHours(totalLogged)}h\nFaltam: ${formatHours(diff)}h`);
            setProcessing(false);
            return;
        }

        // 4. monta a msg de confirmação
        let confirmMsg = `Confirma o fechamento de ${dateName}?\n\n`;
        confirmMsg += `Horas Esperadas: ${expectedHours}h\n`;
        confirmMsg += `Horas Lançadas: ${formatHours(totalLogged)}h\n`;
        
        if (diff > 0) {
            confirmMsg += `\nDiferença: -${formatHours(diff)}h (Abaixo do esperado)\n`;
        } else if (diff < 0) {
            confirmMsg += `\nDiferença: +${formatHours(Math.abs(diff))}h (Acima do esperado)\n`;
        } else {
            confirmMsg += `\nStatus: Completo\n`;
        }

        confirmMsg += `\nApós o envio, o status mudará para "Aguardando Aprovação" e você não poderá mais editar lançamentos.`;

        if (!window.confirm(confirmMsg)) {
            setProcessing(false);
            return;
        }
        
        // envia (sem passar managerId na mão, deixa a store buscar atualizada)
        await store.submitPeriod(userId, year, month);
        
        // refresh do rolê
        await loadStatus(); 
        if(onUpdate) onUpdate(); 
        
        alert("Mês enviado com sucesso!");
      } catch (error: any) {
          console.error(error);
          const msg = error?.message || JSON.stringify(error) || "Erro desconhecido";
          
          if (msg.includes('Could not find the table') || msg.includes('schema cache')) {
               alert("ERRO DE CONFIGURAÇÃO DO BANCO:\n\nA tabela 'timesheet_periods' não foi encontrada.\n\nSOLUÇÃO:\n1. Vá ao Painel Admin.\n2. Clique em 'Configurações'.\n3. Copie o SQL em 'Ver Schema SQL'.\n4. Execute no Editor SQL do Supabase.");
          } else {
               alert(`Ocorreu um erro ao enviar o timesheet: ${msg}`);
          }
      } finally {
          setProcessing(false);
      }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-6">
        {/* alerta de gestor delegado */}
        {delegatedManagerName && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-amber-900 text-sm">Gestor Temporário</p>
                    <p className="text-amber-800 text-sm mt-1">
                        Seu gestor está ausente. Suas aprovações estão sendo gerenciadas por <strong>{delegatedManagerName}</strong>.
                    </p>
                </div>
            </div>
        )}

        {/* card do status atual */}
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
                     periodStatus?.status === 'SUBMITTED' ? 'Aguardando Aprovação' :
                     periodStatus?.status === 'REJECTED' ? 'Rejeitado' : 'Aprovado'}
                </span>
                
                {/* botão de envio do mês atual direto no card */}
                {(periodStatus?.status === 'OPEN' || periodStatus?.status === 'REJECTED') && (
                    <button 
                        onClick={() => periodStatus && validateAndSubmit(periodStatus.year, periodStatus.month)}
                        disabled={processing}
                        className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="Enviar Mês Atual"
                    >
                        {processing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} 
                        Enviar
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

        {/* lista de histórico */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <History size={18} className="text-slate-500"/>
                <h3 className="font-semibold text-slate-700">Histórico de Fechamentos</h3>
            </div>
            <div className="divide-y divide-gray-100">
                {periodHistory.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">Nenhum histórico disponível.</div>
                ) : (
                    periodHistory.map((ph) => {
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

                                {/* botão de ação: se aberto/rejeitado, libera enviar */}
                                {(ph.status === 'OPEN' || ph.status === 'REJECTED') && (
                                    <button 
                                        onClick={() => validateAndSubmit(ph.year, ph.month)}
                                        disabled={processing}
                                        className="text-xs bg-white border border-slate-200 hover:border-brand-500 hover:text-brand-600 text-slate-500 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                                        title="Encerrar Mês"
                                    >
                                        Enviar
                                    </button>
                                )}
                                {ph.status === 'SUBMITTED' && (
                                    <span className="text-amber-400" title="Aguardando Aprovação"><Clock size={16} /></span>
                                )}
                                {ph.status === 'APPROVED' && (
                                    <span className="text-green-500" title="Aprovado"><CheckCircle size={16} /></span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    </div>
  );
};
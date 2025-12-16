
import React, { useState } from 'react';
import { BookOpen, HelpCircle, ShieldCheck, Lock, FileText, CheckCircle, UserCheck, Server } from 'lucide-react';

export const HelpCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'manual' | 'faq' | 'about'>('manual');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Central de Ajuda</h1>
            <p className="text-slate-500">Documentação, suporte e informações institucionais.</p>
        </div>
        
        {/* Tabs */}
        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            <button 
                onClick={() => setActiveTab('manual')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'manual' ? 'bg-brand-50 text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <BookOpen size={16} /> Manual
            </button>
            <button 
                onClick={() => setActiveTab('faq')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'faq' ? 'bg-brand-50 text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <HelpCircle size={16} /> FAQ
            </button>
            <button 
                onClick={() => setActiveTab('about')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'about' ? 'bg-brand-50 text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <ShieldCheck size={16} /> Sobre & LGPD
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 md:p-8 min-h-[60vh]">
        
        {/* --- MANUAL TAB --- */}
        {activeTab === 'manual' && (
            <div className="space-y-8 animate-in fade-in duration-300">
                <section>
                    <h2 className="text-xl font-bold text-brand-800 mb-4 flex items-center gap-2">
                        <FileText /> Fluxo do Processo
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <div className="w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center font-bold mb-3">1</div>
                            <h3 className="font-bold text-slate-700 mb-2">Lançamento Diário</h3>
                            <p className="text-sm text-slate-600">
                                O colaborador deve acessar o sistema diariamente e lançar as horas trabalhadas por projeto. A meta diária é de <strong>8.8 horas</strong> (8h48m).
                            </p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <div className="w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center font-bold mb-3">2</div>
                            <h3 className="font-bold text-slate-700 mb-2">Fechamento Mensal</h3>
                            <p className="text-sm text-slate-600">
                                Ao final do mês (ou no primeiro dia útil do mês seguinte), o colaborador deve clicar em <strong>"Enviar Mês"</strong> no seu Dashboard. Isso bloqueia edições e notifica o gestor.
                            </p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <div className="w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center font-bold mb-3">3</div>
                            <h3 className="font-bold text-slate-700 mb-2">Aprovação do Gestor</h3>
                            <p className="text-sm text-slate-600">
                                O gestor analisa os lançamentos. Se aprovado, o ciclo fecha. Se rejeitado, o colaborador recebe uma notificação para corrigir e reenviar.
                            </p>
                        </div>
                    </div>
                </section>

                <hr className="border-gray-100" />

                <section>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Entendendo os Status</h2>
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <span className="mt-1 px-2 py-0.5 rounded text-xs font-bold uppercase bg-white border border-slate-300 text-slate-600">Em Aberto</span>
                            <p className="text-sm text-slate-600">O mês está ativo. Você pode adicionar, editar ou excluir lançamentos livremente.</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="mt-1 px-2 py-0.5 rounded text-xs font-bold uppercase bg-amber-100 text-amber-800">Em Análise</span>
                            <p className="text-sm text-slate-600">Você enviou o mês para aprovação. Seus lançamentos estão bloqueados para edição até que o gestor responda.</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="mt-1 px-2 py-0.5 rounded text-xs font-bold uppercase bg-red-100 text-red-800">Rejeitado</span>
                            <p className="text-sm text-slate-600">O gestor devolveu seu timesheet. Leia o motivo da devolução no dashboard, faça as correções necessárias e envie novamente.</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="mt-1 px-2 py-0.5 rounded text-xs font-bold uppercase bg-green-100 text-green-800">Aprovado</span>
                            <p className="text-sm text-slate-600">O ciclo foi encerrado com sucesso. Nenhuma alteração é permitida.</p>
                        </div>
                    </div>
                </section>
            </div>
        )}

        {/* --- FAQ TAB --- */}
        {activeTab === 'faq' && (
            <div className="space-y-6 max-w-3xl animate-in fade-in duration-300">
                <h2 className="text-xl font-bold text-brand-800 mb-6 flex items-center gap-2">
                    <HelpCircle /> Perguntas Frequentes
                </h2>

                <div className="space-y-4">
                    <details className="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                        <summary className="font-semibold text-slate-800 flex justify-between items-center list-none">
                            Esqueci minha senha, como recupero?
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                            Atualmente, o reset de senha é feito pelo Administrador do sistema. Entre em contato com a equipe de Auditoria Interna para solicitar uma nova senha provisória.
                        </p>
                    </details>

                    <details className="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                        <summary className="font-semibold text-slate-800 flex justify-between items-center list-none">
                            Lancei horas no projeto errado e já enviei para aprovação.
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                            Se o status estiver "Em Análise", solicite ao seu gestor que <strong>Rejeite/Devolva</strong> o timesheet. Assim que ele fizer isso, o mês ficará aberto novamente para você corrigir e reenviar.
                        </p>
                    </details>

                    <details className="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                        <summary className="font-semibold text-slate-800 flex justify-between items-center list-none">
                            Como lanço feriados ou férias?
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                            <strong>Feriados Nacionais:</strong> O sistema já desconta feriados do cálculo de "Horas Esperadas". Você não precisa lançar nada nesses dias.<br/><br/>
                            <strong>Férias:</strong> Utilize o projeto de classificação "Férias/Ausência". Você pode usar a função de "Lançamento em Lote" para lançar o período todo de uma vez.
                        </p>
                    </details>

                    <details className="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                        <summary className="font-semibold text-slate-800 flex justify-between items-center list-none">
                            O que é o projeto "Backoffice"?
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                            Use esta classificação para atividades administrativas internas que não estão atreladas a um Trabalho de Auditoria específico (ex: treinamentos obrigatórios de RH, reuniões gerais de departamento, configuração de máquina).
                        </p>
                    </details>
                </div>
            </div>
        )}

        {/* --- ABOUT TAB --- */}
        {activeTab === 'about' && (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div className="bg-gradient-to-r from-brand-900 to-brand-700 text-white p-8 rounded-2xl shadow-lg">
                    <h2 className="text-2xl font-bold mb-4">AuditFlow Timesheet</h2>
                    <p className="text-brand-100 leading-relaxed max-w-2xl">
                        Este aplicativo foi <strong>100% desenvolvido pela equipe de Auditoria Interna do Grupo Casas Bahia</strong>. 
                        Uma solução customizada para atender as necessidades específicas de Governança, Riscos e Compliance, 
                        trazendo agilidade e transparência para a gestão de tempos e projetos.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section>
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <ShieldCheck className="text-green-600" /> Segurança & Privacidade (LGPD)
                        </h3>
                        <div className="prose prose-sm text-slate-600 space-y-3">
                            <p>
                                A segurança da informação é um pilar fundamental desta ferramenta. O aplicativo foi construído seguindo rigorosos padrões de desenvolvimento seguro.
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    <strong>Dados Pessoais:</strong> O sistema armazena estritamente dados corporativos necessários para a operação (Nome, Email Corporativo e Estrutura Hierárquica).
                                </li>
                                <li>
                                    <strong>Dados Sensíveis:</strong> Não coletamos nem armazenamos nenhum dado pessoal sensível (como CPF, RG, Endereço, Dados de Saúde ou Biometria), garantindo conformidade total com a LGPD para ferramentas de produtividade.
                                </li>
                                <li>
                                    <strong>Criptografia:</strong> Todas as senhas são armazenadas utilizando Hash SHA-256 unidirecional. A comunicação com o servidor é criptografada via HTTPS (TLS 1.2+).
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                            <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <UserCheck size={18} /> Equipe Responsável
                            </h4>
                            <p className="text-sm text-slate-600">
                                Desenvolvimento e Manutenção:<br/>
                                <strong>Time de Planejamento e Controle - Auditoria Interna</strong><br/>
                                Grupo Casas Bahia
                            </p>
                        </div>

                        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                            <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <Server size={18} /> Infraestrutura
                            </h4>
                            <p className="text-sm text-slate-600">
                                Banco de Dados: Supabase (PostgreSQL Enterprise)<br/>
                                Hospedagem Frontend: GitHub Pages<br/>
                                Versão Atual: 1.2.0 (Fev/2025)
                            </p>
                        </div>
                    </section>
                </div>

                <div className="text-center pt-8 border-t border-gray-100">
                    <p className="text-xs text-slate-400">© 2025 Grupo Casas Bahia - Todos os direitos reservados. Uso exclusivo interno.</p>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

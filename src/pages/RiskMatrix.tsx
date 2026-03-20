import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Lock, Info, RefreshCcw, Save } from 'lucide-react';
import { RiskMatrixRecord } from '../types';
import { store } from '../services/store';

type MatrixView = 'RESIDUAL' | 'INHERENT' | 'MOVEMENT';

const toFive = (value: number) => Number(value).toFixed(5);

const DEFAULT_SAMPLE_RISKS: Omit<RiskMatrixRecord, 'id' | 'updatedAt' | 'updatedBy'>[] = [
  { code: 'R001', title: 'Dificuldade de atracao e retencao de talentos', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.11765, inherentProbability: 5.00000, residualImpact: 3.82353, residualProbability: 4.00000 },
  { code: 'R002', title: 'Desalinhamento com a cultura organizacional', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 2.88235, inherentProbability: 5.00000, residualImpact: 2.52941, residualProbability: 3.85714 },
  { code: 'R003', title: 'Tomada de decisao sem analise de impacto estruturada', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.05882, inherentProbability: 4.00000, residualImpact: 3.70588, residualProbability: 4.00000 },
  { code: 'R004', title: 'Nao conformidade em licenciamentos', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.88235, inherentProbability: 5.00000, residualImpact: 4.52941, residualProbability: 4.57143 },
  { code: 'R005', title: 'Defasagem / Inadequacao Tecnologica', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.64706, inherentProbability: 5.00000, residualImpact: 3.29412, residualProbability: 4.42857 },
  { code: 'R006', title: 'Dados imprecisos ou indisponiveis', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.94118, inherentProbability: 4.50000, residualImpact: 3.00000, residualProbability: 4.00000 },
  { code: 'R007', title: 'Descontinuidade do negocio', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 5.00000, inherentProbability: 5.00000, residualImpact: 5.00000, residualProbability: 4.71429 },
  { code: 'R008', title: 'Ataques ciberneticos', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 5.00000, inherentProbability: 4.50000, residualImpact: 4.17647, residualProbability: 3.57143 },
  { code: 'R009', title: 'Oferta inadequada de produtos e servicos', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.64706, inherentProbability: 5.00000, residualImpact: 3.76471, residualProbability: 3.57143 },
  { code: 'R010', title: 'Insuficiencia de caixa', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.70588, inherentProbability: 5.00000, residualImpact: 4.47059, residualProbability: 4.57143 },
  { code: 'R011', title: 'Experiencia negativa do cliente', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.88235, inherentProbability: 5.00000, residualImpact: 3.35294, residualProbability: 3.85714 },
  { code: 'R012', title: 'Processos judiciais trabalhistas', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.64706, inherentProbability: 5.00000, residualImpact: 3.88235, residualProbability: 4.28571 },
  { code: 'R013', title: 'Riscos de terceiros', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.82353, inherentProbability: 5.00000, residualImpact: 4.17647, residualProbability: 4.00000 },
  { code: 'R014', title: 'Baixa competitividade digital', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.41176, inherentProbability: 5.00000, residualImpact: 2.76471, residualProbability: 3.57143 },
  { code: 'R015', title: 'Fraude Interna / Externa', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.88235, inherentProbability: 5.00000, residualImpact: 4.00000, residualProbability: 3.71429 },
  { code: 'R016', title: 'Processos judiciais consumeristas', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.88235, inherentProbability: 5.00000, residualImpact: 3.52941, residualProbability: 3.57143 },
  { code: 'R017', title: 'Distorcao em demonstracoes financeiras', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.70588, inherentProbability: 4.50000, residualImpact: 4.17647, residualProbability: 4.28571 },
  { code: 'R018', title: 'Perda de market share', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.05882, inherentProbability: 4.00000, residualImpact: 2.88235, residualProbability: 3.28571 },
  { code: 'R019', title: 'Risco de Credito Direto ao Consumidor', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.64706, inherentProbability: 4.50000, residualImpact: 4.35294, residualProbability: 3.85714 },
  { code: 'R020', title: 'Mudancas regulatorias emergentes', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 5.00000, inherentProbability: 4.00000, residualImpact: 4.58824, residualProbability: 2.71429 },
  { code: 'R021', title: 'Exposicao negativa da marca', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.58824, inherentProbability: 5.00000, residualImpact: 3.76471, residualProbability: 4.28571 },
  { code: 'R022', title: 'Obsolescencia do modelo de negocio', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.82353, inherentProbability: 4.00000, residualImpact: 2.94118, residualProbability: 3.42857 },
  { code: 'R023', title: 'Perdas, Avarias, Roubo e Furto', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.88235, inherentProbability: 5.00000, residualImpact: 3.29412, residualProbability: 4.28571 },
  { code: 'R024', title: 'Tratamento inadequado de dados pessoais', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.88235, inherentProbability: 3.50000, residualImpact: 3.41176, residualProbability: 3.00000 },
  { code: 'R025', title: 'Ocorrencia de acidentes', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.88235, inherentProbability: 4.50000, residualImpact: 3.47059, residualProbability: 3.28571 },
  { code: 'R026', title: 'Obsolescencia do servico de credito', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.29412, inherentProbability: 3.50000, residualImpact: 2.64706, residualProbability: 3.42857 },
  { code: 'R027', title: 'Risco de contagio', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.17647, inherentProbability: 4.50000, residualImpact: 3.64706, residualProbability: 3.71429 },
  { code: 'R028', title: 'Descontinuidade da estrategia', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 3.88235, inherentProbability: 4.00000, residualImpact: 3.17647, residualProbability: 3.00000 },
  { code: 'R029', title: 'Processos judiciais tributarios', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.17647, inherentProbability: 3.50000, residualImpact: 3.64706, residualProbability: 2.42857 },
  { code: 'R030', title: 'Gestao ineficiente de estoque', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.17647, inherentProbability: 5.00000, residualImpact: 3.88235, residualProbability: 4.28571 },
  { code: 'R031', title: 'Vazamento de informacao', category: 'Risco', ownerArea: 'OUTROS', inherentImpact: 4.17647, inherentProbability: 4.50000, residualImpact: 3.35294, residualProbability: 3.28571 }
];

const getBackgroundTone = (xRatio: number, yRatio: number) => {
  const severity = (xRatio + yRatio) / 2;
  if (severity > 0.78) return 'rgba(248, 113, 113, 0.18)';
  if (severity > 0.58) return 'rgba(251, 191, 36, 0.18)';
  return 'rgba(52, 211, 153, 0.15)';
};

export const RiskMatrix: React.FC = () => {
  const [records, setRecords] = useState<RiskMatrixRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RiskMatrixRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [view, setView] = useState<MatrixView>('MOVEMENT');

  const access = store.getRiskMatrixAccessForCurrentUser();
  const canEdit = access === 'EDIT';

  const loadRecords = async () => {
    setLoading(true);
    const loaded = await store.getRiskMatrixRecords();
    setRecords(loaded);
    setDrafts(loaded.reduce<Record<string, RiskMatrixRecord>>((acc, item) => {
      acc[item.id] = { ...item };
      return acc;
    }, {}));
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const axis = useMemo(() => {
    const allValues = records.flatMap((r) => [
      r.inherentImpact,
      r.inherentProbability,
      r.residualImpact,
      r.residualProbability
    ]);

    const min = Math.min(...allValues, 0.00001);
    const max = Math.max(...allValues, 1);
    const span = Math.max(max - min, 0.00001);

    return { min, max, span };
  }, [records]);

  const normalize = (value: number) => (value - axis.min) / axis.span;

  const handleDraftChange = (recordId: string, key: keyof RiskMatrixRecord, value: string) => {
    setDrafts((prev) => {
      const current = prev[recordId];
      if (!current) return prev;

      const isNumericField = key.includes('Impact') || key.includes('Probability');
      const normalizedNumericValue = Number(String(value).replace(',', '.'));

      const next: RiskMatrixRecord = {
        ...current,
        [key]: isNumericField
          ? (Number.isFinite(normalizedNumericValue)
            ? normalizedNumericValue
            : (current[key] as number))
          : value
      } as RiskMatrixRecord;

      return {
        ...prev,
        [recordId]: next
      };
    });
  };

  const handleSaveAll = async () => {
    if (!canEdit) return;

    setSaving(true);
    let failures = 0;

    for (const item of Object.values(drafts)) {
      const ok = await store.saveRiskMatrixRecord({
        id: item.id,
        code: item.code,
        title: item.title,
        category: item.category,
        ownerArea: item.ownerArea,
        inherentImpact: item.inherentImpact,
        inherentProbability: item.inherentProbability,
        residualImpact: item.residualImpact,
        residualProbability: item.residualProbability
      });

      if (!ok) failures += 1;
    }

    setSaving(false);

    if (failures > 0) {
      alert(`Nao foi possivel salvar ${failures} registro(s). Confira a chave VITE_RISK_MATRIX_ENCRYPTION_KEY.`);
      return;
    }

    alert('Matriz de riscos salva com sucesso.');
    loadRecords();
  };

  const handleBootstrap = async () => {
    if (!canEdit) return;

    setSaving(true);
    let failures = 0;

    for (const sample of DEFAULT_SAMPLE_RISKS) {
      const ok = await store.saveRiskMatrixRecord({
        id: crypto.randomUUID(),
        ...sample
      });
      if (!ok) failures += 1;
    }

    setSaving(false);

    if (failures > 0) {
      alert('Nao foi possivel carregar a base inicial. Verifique a chave de criptografia e o schema no Supabase.');
      return;
    }

    await loadRecords();
    alert('Base inicial da matriz carregada com sucesso.');
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Carregando Matriz de Riscos...</div>;
  }

  if (access === 'NONE') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Matriz de Riscos</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-900">Acesso restrito</h2>
          <p className="text-sm text-amber-800 mt-2">
            Seu perfil nao possui permissao para visualizar esta pagina. Solicite ao administrador o acesso de leitura ou edicao.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Matriz de Riscos</h1>
          <p className="text-sm text-slate-500 mt-1">Visualizacao de risco inerente, residual e movimentacao por evento de risco.</p>
        </div>
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
          <Shield size={14} className="mr-2 text-emerald-600" />
          Permissao atual: {access === 'EDIT' ? 'Edicao' : 'Leitura'}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Lock size={18} className="text-emerald-700 mt-0.5" />
          <p className="text-sm text-emerald-900">
            Os dados desta pagina sao armazenados criptografados (AES-GCM) e so sao descriptografados no app para usuarios autorizados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSecurityDetails(true)}
          className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-900"
        >
          <Info size={14} />
          Saiba mais
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setView('INHERENT')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${view === 'INHERENT' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Risco inerente
          </button>
          <button
            type="button"
            onClick={() => setView('RESIDUAL')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${view === 'RESIDUAL' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Risco residual
          </button>
          <button
            type="button"
            onClick={() => setView('MOVEMENT')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${view === 'MOVEMENT' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Movimentacao dos riscos
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <svg viewBox="0 0 860 470" className="w-full min-w-[700px] h-auto">
            <rect x="0" y="0" width="860" height="470" fill="#ffffff" />
            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 5 }).map((__, col) => {
                const xRatio = col / 4;
                const yRatio = 1 - (row / 4);
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={90 + col * 140}
                    y={40 + row * 78}
                    width={140}
                    height={78}
                    fill={getBackgroundTone(xRatio, yRatio)}
                    stroke="#ffffff"
                    strokeWidth={3}
                  />
                );
              })
            )}

            <text x="430" y="450" textAnchor="middle" className="fill-slate-500 text-[14px] font-bold">IMPACTO</text>
            <text x="28" y="245" textAnchor="middle" className="fill-slate-500 text-[14px] font-bold" transform="rotate(-90 28 245)">PROBABILIDADE</text>

            {records.map((record) => {
              const ix = 90 + normalize(record.inherentImpact) * 700;
              const iy = 430 - normalize(record.inherentProbability) * 390;
              const rx = 90 + normalize(record.residualImpact) * 700;
              const ry = 430 - normalize(record.residualProbability) * 390;

              if (view === 'MOVEMENT') {
                return (
                  <g key={record.id}>
                    <title>{`${record.code} - ${record.title}`}</title>
                    <line x1={ix} y1={iy} x2={rx} y2={ry} stroke="#64748b" strokeDasharray="5 5" strokeWidth={1.5} />
                    <circle cx={ix} cy={iy} r={6} fill="#e2e8f0" stroke="#94a3b8" />
                    <circle cx={rx} cy={ry} r={10} fill="#f59e0b" opacity={0.22} />
                    <circle cx={rx} cy={ry} r={6.5} fill="#f59e0b" />
                    <text x={rx + 10} y={ry + 4} className="fill-slate-700 text-[11px] font-bold">{record.code}</text>
                  </g>
                );
              }

              const x = view === 'INHERENT' ? ix : rx;
              const y = view === 'INHERENT' ? iy : ry;
              const pointColor = view === 'INHERENT' ? '#0ea5e9' : '#f59e0b';

              return (
                <g key={record.id}>
                  <title>{`${record.code} - ${record.title}`}</title>
                  <circle cx={x} cy={y} r={8} fill={pointColor} />
                  <text x={x + 9} y={y + 3} className="fill-slate-700 text-[11px] font-bold">{record.code}</text>
                </g>
              );
            })}

            <text x="90" y="22" className="fill-slate-400 text-[11px]">Escala continua: min {toFive(axis.min)} | max {toFive(axis.max)}</text>
          </svg>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Base de Riscos</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadRecords}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw size={14} />
              Recarregar
            </button>
            {canEdit && records.length === 0 && (
              <button
                type="button"
                onClick={handleBootstrap}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60"
              >
                Carregar base oficial (31 riscos)
              </button>
            )}
            {canEdit && records.length > 0 && (
              <button
                type="button"
                onClick={handleBootstrap}
                disabled={saving}
                className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 disabled:opacity-60"
              >
                Reaplicar base oficial (31 riscos)
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
              >
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-2">Codigo</th>
                <th className="p-2">Descricao</th>
                <th className="p-2">Imp. Inerente</th>
                <th className="p-2">Prob. Inerente</th>
                <th className="p-2">Imp. Residual</th>
                <th className="p-2">Prob. Residual</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const draft = drafts[record.id] || record;
                return (
                  <tr key={record.id} className="border-b border-slate-100">
                    <td className="p-2 font-bold text-slate-700">{record.code}</td>
                    <td className="p-2">
                      {canEdit ? (
                        <input
                          className="w-full border border-slate-300 rounded p-1.5"
                          value={draft.title}
                          onChange={(e) => handleDraftChange(record.id, 'title', e.target.value)}
                        />
                      ) : (
                        <span>{draft.title}</span>
                      )}
                    </td>
                    <td className="p-2">
                      {canEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-28 border border-slate-300 rounded p-1.5"
                          value={toFive(draft.inherentImpact)}
                          onChange={(e) => handleDraftChange(record.id, 'inherentImpact', e.target.value)}
                        />
                      ) : toFive(draft.inherentImpact)}
                    </td>
                    <td className="p-2">
                      {canEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-28 border border-slate-300 rounded p-1.5"
                          value={toFive(draft.inherentProbability)}
                          onChange={(e) => handleDraftChange(record.id, 'inherentProbability', e.target.value)}
                        />
                      ) : toFive(draft.inherentProbability)}
                    </td>
                    <td className="p-2">
                      {canEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-28 border border-slate-300 rounded p-1.5"
                          value={toFive(draft.residualImpact)}
                          onChange={(e) => handleDraftChange(record.id, 'residualImpact', e.target.value)}
                        />
                      ) : toFive(draft.residualImpact)}
                    </td>
                    <td className="p-2">
                      {canEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-28 border border-slate-300 rounded p-1.5"
                          value={toFive(draft.residualProbability)}
                          onChange={(e) => handleDraftChange(record.id, 'residualProbability', e.target.value)}
                        />
                      ) : toFive(draft.residualProbability)}
                    </td>
                  </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    Nenhum risco cadastrado. Use "Carregar base inicial" ou execute o seed na migration.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSecurityDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSecurityDetails(false)}>
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-100 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Como protegemos os dados da Matriz de Riscos</h3>
            <ul className="mt-4 text-sm text-slate-600 space-y-2 list-disc pl-5">
              <li>Os dados sensiveis sao armazenados criptografados com AES-GCM antes de irem para o banco.</li>
              <li>Sem permissao (NONE), o usuario nao acessa a pagina nem os registros no fluxo da aplicacao.</li>
              <li>A chave de criptografia e controlada por ambiente (VITE_RISK_MATRIX_ENCRYPTION_KEY), fora da tabela de dados.</li>
              <li>Usuarios autorizados conseguem visualizar conforme permissao de leitura ou edicao definida no Admin.</li>
            </ul>
            <div className="mt-5 text-right">
              <button
                type="button"
                onClick={() => setShowSecurityDetails(false)}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

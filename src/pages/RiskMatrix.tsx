import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Shield, Lock, Info, RefreshCcw, Save, Filter, Upload, FileSpreadsheet, X, AlertCircle, ChevronDown, ChevronUp, Maximize, Minimize } from 'lucide-react';
import { RiskMatrixRecord } from '../types';
import { store } from '../services/store';

type MatrixView = 'RESIDUAL' | 'INHERENT' | 'MOVEMENT';

type StagingRow = {
  code: string;
  title: string;
  inherentImpact: string;
  inherentProbability: string;
  residualImpact: string;
  residualProbability: string;
};

const toFive = (value: number) => Number(value).toFixed(5);

const formatRiskCode = (value: string) => {
  const normalized = String(value || '').trim().toUpperCase();
  const digits = normalized.replace(/\D/g, '');

  if (!digits) return normalized;

  return `R${digits.slice(-3).padStart(3, '0')}`;
};

// Formata apenas o número na bolinha (sem R e sem zeros iniciais)
const formatRiskCodeForDisplay = (value: string) => {
  const normalized = String(value || '').trim().toUpperCase();
  const digits = normalized.replace(/\D/g, '');
  if (!digits) return normalized;
  return String(Number(digits.slice(-3)));
};

const splitRiskTitle = (value: string, lineLength = 26) => {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= lineLength) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);

  if (lines.length <= 2) return lines;

  const firstLine = lines[0];
  const secondLine = `${lines.slice(1).join(' ')}`;
  return [firstLine, secondLine.length > lineLength ? `${secondLine.slice(0, lineLength - 3)}...` : secondLine];
};



// Paleta fixa da matriz alinhada ao print de referencia.
const getCellColor = (col: number, row: number) => {
  const colorMap = [
    ['rgba(243, 234, 0, 0.78)', 'rgba(243, 234, 0, 0.78)', 'rgba(255, 191, 0, 0.76)', 'rgba(255, 51, 31, 0.76)', 'rgba(255, 31, 31, 0.78)'],
    ['rgba(94, 138, 58, 0.80)', 'rgba(243, 234, 0, 0.78)', 'rgba(255, 196, 0, 0.76)', 'rgba(255, 191, 0, 0.76)', 'rgba(255, 51, 31, 0.76)'],
    ['rgba(94, 138, 58, 0.80)', 'rgba(94, 138, 58, 0.80)', 'rgba(243, 234, 0, 0.78)', 'rgba(255, 196, 0, 0.76)', 'rgba(255, 191, 0, 0.76)'],
    ['rgba(47, 49, 232, 0.76)', 'rgba(94, 138, 58, 0.80)', 'rgba(94, 138, 58, 0.80)', 'rgba(243, 234, 0, 0.78)', 'rgba(255, 196, 0, 0.76)'],
    ['rgba(47, 49, 232, 0.76)', 'rgba(47, 49, 232, 0.76)', 'rgba(94, 138, 58, 0.80)', 'rgba(243, 234, 0, 0.78)', 'rgba(243, 234, 0, 0.78)']
  ];

  return colorMap[row]?.[col] ?? 'rgba(255, 255, 255, 1)';
};

export const RiskMatrix: React.FC = () => {
  const [records, setRecords] = useState<RiskMatrixRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RiskMatrixRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [view, setView] = useState<MatrixView>('MOVEMENT');
  const [hoveredRisk, setHoveredRisk] = useState<{ record: RiskMatrixRecord; x: number; y: number } | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRiskBase, setShowRiskBase] = useState(false);
  const [staging, setStaging] = useState<StagingRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const access = store.getRiskMatrixAccessForCurrentUser();
  const canEdit = access === 'EDIT';

  const loadRecords = async () => {
    setLoading(true);
    const loaded = await store.getRiskMatrixRecords();
    setRecords(loaded);
    setSelectedCodes(new Set(loaded.map(r => r.code)));
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

  // Ordena riscos por score residual (descendente)
  const sortedRecordsByRisk = useMemo(() => {
    return [...records].sort((a, b) => {
      const scoreA = a.residualImpact * a.residualProbability;
      const scoreB = b.residualImpact * b.residualProbability;
      return scoreB - scoreA; // descendente
    });
  }, [records]);

  // Tooltip SVG renderizado sobre a bolinha em hover
  const tooltipEl = useMemo(() => {
    if (!hoveredRisk) return null;
    const { record, x, y } = hoveredRisk;
    const formattedCode = formatRiskCode(record.code);
    const inherentScore = record.inherentImpact * record.inherentProbability;
    const residualScore = record.residualImpact * record.residualProbability;
    const mitigation = inherentScore > 0
      ? Math.max(0, ((inherentScore - residualScore) / inherentScore) * 100)
      : 0;
    const titleLines = splitRiskTitle(record.title, 28);
    const tw = 278;
    const th = 108;
    const tx = x > 560 ? x - tw - 18 : x + 18;
    const ty = Math.min(Math.max(y - 42, 8), 470 - th - 8);

    return (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={tx + 5} y={ty + 5} width={tw} height={th} rx={14} fill="rgba(15, 23, 42, 0.12)" />
        <rect x={tx} y={ty} width={tw} height={th} rx={14} fill="#162032" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        <rect x={tx + 12} y={ty + 12} width="48" height="24" rx="8" fill="#0f172a" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
        <text x={tx + 36} y={ty + 28} textAnchor="middle" fontSize={10} fontWeight="700" fill="#f8fafc">{formattedCode}</text>
        <text x={tx + 72} y={ty + 24} fontSize={9} fill="#e2e8f0">{titleLines[0] || ''}</text>
        {titleLines[1] && (
          <text x={tx + 72} y={ty + 36} fontSize={9} fill="#cbd5e1">{titleLines[1]}</text>
        )}

        <rect x={tx + 12} y={ty + 50} width="120" height="34" rx="8" fill="rgba(255,255,255,0.05)" />
        <rect x={tx + 146} y={ty + 50} width="120" height="34" rx="8" fill="rgba(255,255,255,0.05)" />

        <text x={tx + 72} y={ty + 63} textAnchor="middle" fontSize={7} fill="#94a3b8">Inerente</text>
        <text x={tx + 72} y={ty + 75} textAnchor="middle" fontSize={8.5} fontWeight="700" fill="#f8fafc">{record.inherentImpact.toFixed(3)} x {record.inherentProbability.toFixed(3)}</text>
        <text x={tx + 72} y={ty + 86} textAnchor="middle" fontSize={7} fill="#cbd5e1">Score: {inherentScore.toFixed(3)}</text>

        <text x={tx + 206} y={ty + 63} textAnchor="middle" fontSize={7} fill="#60a5fa">Residual</text>
        <text x={tx + 206} y={ty + 75} textAnchor="middle" fontSize={8.5} fontWeight="700" fill="#f8fafc">{record.residualImpact.toFixed(3)} x {record.residualProbability.toFixed(3)}</text>
        <text x={tx + 206} y={ty + 86} textAnchor="middle" fontSize={7} fill="#cbd5e1">Score: {residualScore.toFixed(3)}</text>

        <text x={tx + 14} y={ty + 101} fontSize={8} fontWeight="600" fill="#94a3b8">Mitigacao</text>
        <text x={tx + tw - 14} y={ty + 101} textAnchor="end" fontSize={8} fontWeight="700" fill="#4ade80">{mitigation.toFixed(1)}%</text>
      </g>
    );
  }, [hoveredRisk]);

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

  // Faz a leitura do Excel e popula o staging para revisao antes de salvar
  const handleExcelFile = async (file: File) => {
    setImportError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

      // Tenta mapear pelos cabecalhos da primeira linha (case-insensitive)
      const headers = (rows[0] as string[]).map((h) => String(h || '').toLowerCase());

      const colIndex = (keywords: string[]) =>
        headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));

      const idxId    = colIndex(['id']);
      const idxTitle = colIndex(['risco', 'descri', 'titulo', 'title']);
      const idxII    = colIndex(['impacto_nota_iner', 'imp.*iner', 'inherentimpact']);
      const idxIP    = colIndex(['probabilidade_nota_iner', 'prob.*iner', 'inherentprob']);
      const idxRI    = colIndex(['impacto_nota_res', 'imp.*res', 'residualimpact']);
      const idxRP    = colIndex(['probabilidade_nota_r', 'prob.*res', 'residualprob']);

      if ([idxId, idxTitle, idxII, idxIP, idxRI, idxRP].some((i) => i === -1)) {
        // Fallback: tenta por posicao fixa (A=0, B=1, D=3, E=4, F=5, G=6)
        const dataRows = rows.slice(1).filter((r) => (r as unknown[])[0]);
        const parsed = dataRows.map((r) => {
          const row = r as unknown[];
          return {
            code:                String(row[0] ?? '').trim(),
            title:               String(row[1] ?? '').trim(),
            inherentImpact:      String(row[3] ?? '').replace(',', '.'),
            inherentProbability: String(row[4] ?? '').replace(',', '.'),
            residualImpact:      String(row[5] ?? '').replace(',', '.'),
            residualProbability: String(row[6] ?? '').replace(',', '.'),
          } as StagingRow;
        });
        if (parsed.length === 0) throw new Error('Nenhum dado encontrado no arquivo.');
        setStaging(parsed);
        return;
      }

      const dataRows = rows.slice(1).filter((r) => (r as unknown[])[idxId]);
      const parsed = dataRows.map((r) => {
        const row = r as unknown[];
        return {
          code:                String(row[idxId]    ?? '').trim(),
          title:               String(row[idxTitle] ?? '').trim(),
          inherentImpact:      String(row[idxII]    ?? '').replace(',', '.'),
          inherentProbability: String(row[idxIP]    ?? '').replace(',', '.'),
          residualImpact:      String(row[idxRI]    ?? '').replace(',', '.'),
          residualProbability: String(row[idxRP]    ?? '').replace(',', '.'),
        } as StagingRow;
      });

      if (parsed.length === 0) throw new Error('Nenhum dado encontrado no arquivo.');
      setStaging(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao ler o arquivo.');
    }
  };

  // Salva o staging no Supabase (criptografado)
  const handleImportSave = async () => {
    if (!canEdit) return;
    setImportSaving(true);
    let failures = 0;

    for (const row of staging) {
      const iI = parseFloat(row.inherentImpact);
      const iP = parseFloat(row.inherentProbability);
      const rI = parseFloat(row.residualImpact);
      const rP = parseFloat(row.residualProbability);

      if (!row.code || isNaN(iI) || isNaN(iP) || isNaN(rI) || isNaN(rP)) {
        failures++;
        continue;
      }

      const ok = await store.saveRiskMatrixRecord({
        id: crypto.randomUUID(),
        code: formatRiskCode(row.code),
        title: row.title,
        category: 'Risco',
        ownerArea: 'OUTROS',
        inherentImpact: iI,
        inherentProbability: iP,
        residualImpact: rI,
        residualProbability: rP,
      });
      if (!ok) failures++;
    }

    setImportSaving(false);

    if (failures > 0) {
      setImportError(`${failures} linha(s) nao puderam ser salvas. Verifique a chave de criptografia.`);
      return;
    }

    setShowImport(false);
    setStaging([]);
    await loadRecords();
    alert(`${staging.length} riscos importados com sucesso.`);
  };

  const handleSaveAll = async () => {
    if (!canEdit) return;

    setSaving(true);
    let failures = 0;

    for (const item of Object.values(drafts)) {
      const ok = await store.saveRiskMatrixRecord({
        id: item.id,
        code: formatRiskCode(item.code),
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
      alert(`Nao foi possivel salvar ${failures} registro(s). Confira a configuracao de criptografia do ambiente.`);
      return;
    }

    alert('Matriz de riscos salva com sucesso.');
    loadRecords();
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

  // Renderizador de matriz reutilizável
  const renderMatrixSVG = (className?: string) => {
    const svgClass = className || (isFullScreen ? "w-full h-full" : "w-full min-w-[700px] h-auto");
    return (
    <svg viewBox="0 0 900 510" className={svgClass}>
      <rect x="0" y="0" width="900" height="510" fill="#ffffff" />

      {/* Separadores sutis entre labels e células */}
      <line x1="86" y1="38" x2="86" y2="432" stroke="#e2e8f0" strokeWidth={1} />
      <line x1="88" y1="432" x2="832" y2="432" stroke="#e2e8f0" strokeWidth={1} />

      {/* Título PROBABILIDADE - vertical, extremo esquerdo */}
      <text x="11" y="235" textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155" transform="rotate(-90 11 235)">PROBABILIDADE</text>

      {/*
        Labels de probabilidade - rotacionados no eixo Y
        rowCenterY = 40 + row * 78 + 39 → 79, 157, 235, 313, 391
        Rotação -90° ao redor do ponto (64, rowCenterY) centraliza o texto na linha
      */}
      <text x="64" y="79"  textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 64 79)">Extremo</text>
      <text x="64" y="157" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 64 157)">Alto</text>
      <text x="64" y="235" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 64 235)">Moderado</text>
      <text x="64" y="313" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 64 313)">Baixo</text>
      <text x="64" y="391" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 64 391)">Irrelevante</text>

      {/* Células da matriz */}
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 5 }).map((__, col) => (
          <rect
            key={`${row}-${col}`}
            x={90 + col * 140}
            y={40 + row * 78}
            width={140}
            height={78}
            fill={getCellColor(col, row)}
            stroke="#ffffff"
            strokeWidth={3}
          />
        ))
      )}

      {/*
        Labels de impacto - centralizados em cada coluna
        colCenterX = 90 + col * 140 + 70 → 160, 300, 440, 580, 720
      */}
      <text x="160" y="450" textAnchor="middle" fontSize="10" fill="#64748b">Irrelevante</text>
      <text x="300" y="450" textAnchor="middle" fontSize="10" fill="#64748b">Baixo</text>
      <text x="440" y="450" textAnchor="middle" fontSize="10" fill="#64748b">Moderado</text>
      <text x="580" y="450" textAnchor="middle" fontSize="10" fill="#64748b">Alto</text>
      <text x="720" y="450" textAnchor="middle" fontSize="10" fill="#64748b">Extremo</text>

      {/* Título IMPACTO - embaixo, centralizado na largura da matriz */}
      <text x="460" y="478" textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">IMPACTO</text>

      {records.filter(r => selectedCodes.has(r.code)).map((record) => {
        const ix = 90 + normalize(record.inherentImpact) * 700;
        const iy = 430 - normalize(record.inherentProbability) * 390;
        const rx = 90 + normalize(record.residualImpact) * 700;
        const ry = 430 - normalize(record.residualProbability) * 390;

        if (view === 'MOVEMENT') {
          return (
            <g key={record.id} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredRisk({ record, x: rx, y: ry })}
              onMouseLeave={() => setHoveredRisk(null)}
            >
              <line x1={ix} y1={iy} x2={rx} y2={ry} stroke="#64748b" strokeDasharray="5 5" strokeWidth={1} />
              <circle cx={ix} cy={iy} r={6} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1.5} />
              <circle cx={rx} cy={ry} r={12} fill="#facc15" opacity={0.18} />
              <circle cx={rx} cy={ry} r={9} fill="#facc15" stroke="#ffffff" strokeWidth={1.5} />
              <text x={rx} y={ry + 2.5} textAnchor="middle" className="fill-slate-900 text-[6px] font-bold">{formatRiskCodeForDisplay(record.code)}</text>
            </g>
          );
        }

        const x = view === 'INHERENT' ? ix : rx;
        const y = view === 'INHERENT' ? iy : ry;
        const pointColor = view === 'INHERENT' ? '#0ea5e9' : '#f59e0b';

        return (
          <g key={record.id} style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredRisk({ record, x, y })}
            onMouseLeave={() => setHoveredRisk(null)}
          >
            <circle cx={x} cy={y} r={12} fill={pointColor} opacity={0.15} />
            <circle cx={x} cy={y} r={9} fill={pointColor} stroke="#ffffff" strokeWidth={1.5} />
            <text x={x} y={y + 2.5} textAnchor="middle" className="fill-white text-[6px] font-bold">{formatRiskCodeForDisplay(record.code)}</text>
          </g>
        );
      })}

      {tooltipEl}
    </svg>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Matriz de Riscos</h1>
          <p className="text-sm text-slate-500 mt-1">Visualizacao de risco inerente, residual e movimentacao por risco.</p>
        </div>
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
          <Shield size={14} className="mr-2 text-emerald-600" />
          Permissao atual: {access === 'EDIT' ? 'Edicao' : 'Leitura'}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="mb-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
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

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 lg:self-auto"
            >
              {isFullScreen ? <Minimize size={13} /> : <Maximize size={13} />}
              {isFullScreen ? 'Sair do fullscreen' : 'Fullscreen'}
            </button>

            <button
              type="button"
              onClick={() => setShowFilter(f => !f)}
              className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 lg:self-auto"
            >
              <Filter size={13} />
              Filtrar riscos no gráfico ({selectedCodes.size}/{records.length})
            </button>
          </div>

          {showFilter && (
            <div className="lg:basis-full p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex gap-3 mb-2">
                <button type="button" onClick={() => setSelectedCodes(new Set(records.map(r => r.code)))} className="text-xs text-brand-600 font-semibold hover:underline">Selecionar todos</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => setSelectedCodes(new Set())} className="text-xs text-slate-500 font-semibold hover:underline">Limpar</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedRecordsByRisk.map(r => (
                  <button
                    key={r.code}
                    type="button"
                    title={r.title}
                    onClick={() => setSelectedCodes(prev => {
                      const next = new Set(prev);
                      if (next.has(r.code)) next.delete(r.code); else next.add(r.code);
                      return next;
                    })}
                    className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                      selectedCodes.has(r.code)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-400 border-slate-300'
                    }`}
                  >
                    {formatRiskCode(r.code)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-4 overflow-x-auto">
          {renderMatrixSVG()}
        </div>
      </div>

      {isFullScreen && (
        <div className="fixed inset-0 z-50 bg-black/5 flex flex-col p-0">
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex gap-2">
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
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Minimize size={13} />
              Sair
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-white" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            {renderMatrixSVG()}  
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <button
          type="button"
          onClick={() => setShowRiskBase((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-lg font-bold text-slate-800">Base de Riscos</h2>
            <p className="mt-1 text-sm text-slate-500">
              {showRiskBase ? 'Clique para recolher a base e focar no gráfico.' : `Clique para expandir os ${records.length} riscos cadastrados.`}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
            {showRiskBase ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showRiskBase ? 'Recolher' : 'Expandir'}
          </span>
        </button>

        {showRiskBase && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadRecords}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCcw size={14} />
                Recarregar
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setStaging([]); setImportError(null); setShowImport(true); }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  <Upload size={14} />
                  Importar Excel
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

            <div className="mt-4 overflow-x-auto">
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
                  {sortedRecordsByRisk.map((record) => {
                    const draft = drafts[record.id] || record;
                    return (
                      <tr key={record.id} className="border-b border-slate-100">
                        <td className="p-2 font-bold text-slate-700">{formatRiskCode(record.code)}</td>
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
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Nenhum risco cadastrado. Use &ldquo;Importar Excel&rdquo; para carregar os dados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="inline-flex items-center gap-2 text-xs text-slate-500 md:text-sm">
          <Lock size={14} className="text-slate-400" />
          <span>Dados protegidos por criptografia e exibidos apenas para perfis autorizados.</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSecurityDetails(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 md:text-sm"
        >
          <Info size={14} />
          Detalhes
        </button>
      </div>

      {/* Modal: importar Excel */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => { if (!importSaving) { setShowImport(false); setStaging([]); setImportError(null); } }}>
          <div className="w-full max-w-5xl bg-white rounded-2xl border border-slate-100 p-6 my-8" onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={22} className="text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-800">Importar Matriz de Riscos via Excel</h3>
              </div>
              {!importSaving && (
                <button type="button" onClick={() => { setShowImport(false); setStaging([]); setImportError(null); }} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              )}
            </div>

            {staging.length === 0 ? (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Selecione o arquivo Excel (.xlsx / .xls). A primeira linha deve ser o cabeçalho. Colunas esperadas:
                  <strong> ID, Risco, Impacto Inerente, Probabilidade Inerente, Impacto Residual, Probabilidade Residual.</strong>
                </p>
                <div
                  className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f); }}
                >
                  <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Arraste o arquivo aqui ou clique para selecionar</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx ou .xls</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); e.target.value = ''; }}
                />
                {importError && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle size={15} /> {importError}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-600">
                    <strong>{staging.length} riscos</strong> lidos. Revise e edite antes de salvar.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setStaging([]); setImportError(null); }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    Trocar arquivo
                  </button>
                </div>

                <div className="overflow-x-auto max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="p-2 w-20">#</th>
                        <th className="p-2 w-24">ID</th>
                        <th className="p-2">Descrição do Risco</th>
                        <th className="p-2 w-32">Imp. Inerente</th>
                        <th className="p-2 w-32">Prob. Inerente</th>
                        <th className="p-2 w-32">Imp. Residual</th>
                        <th className="p-2 w-32">Prob. Residual</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {staging.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 text-slate-400 text-xs">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              className="w-20 border border-slate-300 rounded p-1 text-xs font-bold"
                              value={row.code}
                              onChange={(e) => setStaging(prev => prev.map((r, i) => i === idx ? { ...r, code: e.target.value } : r))}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-full border border-slate-300 rounded p-1 text-xs"
                              value={row.title}
                              onChange={(e) => setStaging(prev => prev.map((r, i) => i === idx ? { ...r, title: e.target.value } : r))}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-28 border border-slate-300 rounded p-1 text-xs"
                              value={row.inherentImpact}
                              onChange={(e) => setStaging(prev => prev.map((r, i) => i === idx ? { ...r, inherentImpact: e.target.value } : r))}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-28 border border-slate-300 rounded p-1 text-xs"
                              value={row.inherentProbability}
                              onChange={(e) => setStaging(prev => prev.map((r, i) => i === idx ? { ...r, inherentProbability: e.target.value } : r))}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-28 border border-slate-300 rounded p-1 text-xs"
                              value={row.residualImpact}
                              onChange={(e) => setStaging(prev => prev.map((r, i) => i === idx ? { ...r, residualImpact: e.target.value } : r))}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              className="w-28 border border-slate-300 rounded p-1 text-xs"
                              value={row.residualProbability}
                              onChange={(e) => setStaging(prev => prev.map((r, i) => i === idx ? { ...r, residualProbability: e.target.value } : r))}
                            />
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              onClick={() => setStaging(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importError && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle size={15} /> {importError}
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowImport(false); setStaging([]); setImportError(null); }}
                    disabled={importSaving}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleImportSave}
                    disabled={importSaving || staging.length === 0}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Save size={14} />
                    {importSaving ? 'Salvando...' : `Salvar ${staging.length} riscos`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSecurityDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSecurityDetails(false)}>
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-100 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Como protegemos os dados da Matriz de Riscos</h3>
            <ul className="mt-4 text-sm text-slate-600 space-y-2 list-disc pl-5">
              <li>Os dados sensiveis sao armazenados criptografados com AES-GCM antes de irem para o banco.</li>
              <li>Sem permissao (NONE), o usuario nao acessa a pagina nem os registros no fluxo da aplicacao.</li>
              <li>A configuracao de criptografia fica isolada no ambiente da aplicacao, fora da tabela de dados.</li>
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

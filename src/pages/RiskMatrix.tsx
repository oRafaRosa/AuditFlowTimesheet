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

const splitRiskTitle = (value: string, lineLength = 36) => {
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
  const [showMatrixSizeControls, setShowMatrixSizeControls] = useState(false);
  const [matrixWidth, setMatrixWidth] = useState(80);
  const [matrixHeight, setMatrixHeight] = useState(80);
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

  useEffect(() => {
    if (!isFullScreen) {
      setShowMatrixSizeControls(false);
    }
  }, [isFullScreen]);

  useEffect(() => {
    if (!isFullScreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullScreen]);

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

  const matrixLayout = useMemo(() => {
    const cellWidth = isFullScreen ? matrixWidth : 80;
    const cellHeight = isFullScreen ? matrixHeight : 80;
    const matrixLeft = 88;
    const matrixTop = 40;
    const columnCount = 5;
    const rowCount = 5;
    const matrixPixelWidth = columnCount * cellWidth;
    const matrixPixelHeight = rowCount * cellHeight;
    const matrixRight = matrixLeft + matrixPixelWidth;
    const matrixBottom = matrixTop + matrixPixelHeight;

    return {
      cellWidth,
      cellHeight,
      matrixLeft,
      matrixTop,
      matrixPixelWidth,
      matrixPixelHeight,
      matrixRight,
      matrixBottom,
      svgWidth: matrixRight + 102,
      svgHeight: matrixBottom + 70,
      separatorBottom: matrixBottom + 2,
      impactLabelsY: matrixBottom + 7,
      impactLabelsTextY: matrixBottom + 19,
      impactTitleY: matrixBottom + 42,
      verticalTitleY: matrixTop + matrixPixelHeight / 2,
      horizontalTitleX: matrixLeft + matrixPixelWidth / 2,
      probabilityLabelCenters: ['Extremo', 'Alto', 'Moderado', 'Baixo', 'Irrelevante'].map((label, index) => ({
        label,
        cy: matrixTop + index * cellHeight + cellHeight / 2,
      })),
      impactLabelCenters: ['Irrelevante', 'Baixo', 'Moderado', 'Alto', 'Extremo'].map((label, index) => ({
        label,
        cx: matrixLeft + index * cellWidth + cellWidth / 2,
      })),
    };
  }, [isFullScreen, matrixWidth, matrixHeight]);

  // Ordena riscos por score residual (descendente)
  const sortedRecordsByRisk = useMemo(() => {
    return [...records].sort((a, b) => {
      const scoreA = a.residualImpact * a.residualProbability;
      const scoreB = b.residualImpact * b.residualProbability;
      return scoreB - scoreA; // descendente
    });
  }, [records]);

  type PointType = 'inherent' | 'residual';

  type PositionInput = {
    key: string;
    type: PointType;
    targetX: number;
    targetY: number;
    row: number;
    col: number;
    radius: number;
    score: number;
    seed: number;
  };

  type PositionOutput = {
    x: number;
    y: number;
  };

  const RADIUS_INHERENT_STATIC = 12;
  const RADIUS_RESIDUAL_STATIC = 12;
  const RADIUS_INHERENT_MOVEMENT = 6;
  const RADIUS_RESIDUAL_MOVEMENT = 12;

  const positionedPointsByKey = useMemo(() => {
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

    const computeCellFromNorm = (impactNorm: number, probabilityNorm: number) => {
      const clampedImpact = clamp01(impactNorm);
      const clampedProbability = clamp01(probabilityNorm);

      const col = Math.min(4, Math.max(0, Math.floor(clampedImpact * 5)));
      const row = Math.min(4, Math.max(0, Math.floor((1 - clampedProbability) * 5)));
      return { row, col };
    };

    const clampToCell = (
      x: number,
      y: number,
      row: number,
      col: number,
      radius: number,
    ) => {
      const borderInset = radius + 2;
      const cellLeft = matrixLayout.matrixLeft + col * matrixLayout.cellWidth;
      const cellTop = matrixLayout.matrixTop + row * matrixLayout.cellHeight;
      const minX = cellLeft + borderInset;
      const maxX = cellLeft + matrixLayout.cellWidth - borderInset;
      const minY = cellTop + borderInset;
      const maxY = cellTop + matrixLayout.cellHeight - borderInset;

      return {
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY),
        minX,
        maxX,
        minY,
        maxY,
      };
    };

    const overlapPenalty = (
      x: number,
      y: number,
      radius: number,
      placed: Array<{ x: number; y: number; radius: number }>,
    ) => {
      let penalty = 0;
      placed.forEach((point) => {
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = radius + point.radius;
        if (distance < minDistance) {
          penalty += (minDistance - distance);
        }
      });
      return penalty;
    };

    const choosePosition = (
      input: PositionInput,
      placed: Array<{ x: number; y: number; radius: number }>,
    ) => {
      const clampedTarget = clampToCell(input.targetX, input.targetY, input.row, input.col, input.radius);
      let bestX = clampedTarget.x;
      let bestY = clampedTarget.y;
      let bestPenalty = overlapPenalty(bestX, bestY, input.radius, placed);
      let bestDistance = 0;

      if (bestPenalty === 0) {
        return { x: bestX, y: bestY };
      }

      const width = clampedTarget.maxX - clampedTarget.minX;
      const height = clampedTarget.maxY - clampedTarget.minY;
      const maxSearchRadius = Math.ceil(Math.hypot(width, height));
      const angleOffset = (input.seed % 360) * (Math.PI / 180);

      for (let ring = 2; ring <= maxSearchRadius; ring += 2) {
        const steps = Math.max(16, Math.ceil((2 * Math.PI * ring) / 6));
        for (let i = 0; i < steps; i += 1) {
          const angle = angleOffset + ((i / steps) * Math.PI * 2);
          const trial = clampToCell(
            input.targetX + Math.cos(angle) * ring,
            input.targetY + Math.sin(angle) * ring,
            input.row,
            input.col,
            input.radius,
          );

          const penalty = overlapPenalty(trial.x, trial.y, input.radius, placed);
          const distanceFromTarget = Math.hypot(trial.x - clampedTarget.x, trial.y - clampedTarget.y);

          const isBetterPenalty = penalty < bestPenalty - 0.0001;
          const isSamePenaltyCloser = Math.abs(penalty - bestPenalty) <= 0.0001 && distanceFromTarget < bestDistance;

          if (isBetterPenalty || isSamePenaltyCloser) {
            bestX = trial.x;
            bestY = trial.y;
            bestPenalty = penalty;
            bestDistance = distanceFromTarget;
          }

          if (bestPenalty === 0 && ring > bestDistance + 2) {
            break;
          }
        }

        if (bestPenalty === 0) {
          break;
        }
      }

      return { x: bestX, y: bestY };
    };

    const selected = records.filter((record) => selectedCodes.has(record.code));
    const groups = new Map<string, PositionInput[]>();

    selected.forEach((record, index) => {
      const inherentImpactNorm = normalize(record.inherentImpact);
      const inherentProbabilityNorm = normalize(record.inherentProbability);
      const residualImpactNorm = normalize(record.residualImpact);
      const residualProbabilityNorm = normalize(record.residualProbability);

      const inherentCell = computeCellFromNorm(inherentImpactNorm, inherentProbabilityNorm);
      const residualCell = computeCellFromNorm(residualImpactNorm, residualProbabilityNorm);

      const inherentTargetX = matrixLayout.matrixLeft + clamp01(inherentImpactNorm) * matrixLayout.matrixPixelWidth;
      const inherentTargetY = matrixLayout.matrixBottom - clamp01(inherentProbabilityNorm) * matrixLayout.matrixPixelHeight;
      const residualTargetX = matrixLayout.matrixLeft + clamp01(residualImpactNorm) * matrixLayout.matrixPixelWidth;
      const residualTargetY = matrixLayout.matrixBottom - clamp01(residualProbabilityNorm) * matrixLayout.matrixPixelHeight;

      const addPoint = (point: PositionInput) => {
        const cellKey = `${point.row}:${point.col}`;
        const current = groups.get(cellKey) || [];
        current.push(point);
        groups.set(cellKey, current);
      };

      if (view === 'MOVEMENT') {
        addPoint({
          key: `${record.id}:inherent`,
          type: 'inherent',
          targetX: inherentTargetX,
          targetY: inherentTargetY,
          row: inherentCell.row,
          col: inherentCell.col,
          radius: RADIUS_INHERENT_MOVEMENT,
          score: record.inherentImpact * record.inherentProbability,
          seed: index * 37 + 11,
        });

        addPoint({
          key: `${record.id}:residual`,
          type: 'residual',
          targetX: residualTargetX,
          targetY: residualTargetY,
          row: residualCell.row,
          col: residualCell.col,
          radius: RADIUS_RESIDUAL_MOVEMENT,
          score: record.residualImpact * record.residualProbability,
          seed: index * 37 + 23,
        });
      } else if (view === 'INHERENT') {
        addPoint({
          key: `${record.id}:inherent`,
          type: 'inherent',
          targetX: inherentTargetX,
          targetY: inherentTargetY,
          row: inherentCell.row,
          col: inherentCell.col,
          radius: RADIUS_INHERENT_STATIC,
          score: record.inherentImpact * record.inherentProbability,
          seed: index * 37 + 11,
        });
      } else {
        addPoint({
          key: `${record.id}:residual`,
          type: 'residual',
          targetX: residualTargetX,
          targetY: residualTargetY,
          row: residualCell.row,
          col: residualCell.col,
          radius: RADIUS_RESIDUAL_STATIC,
          score: record.residualImpact * record.residualProbability,
          seed: index * 37 + 23,
        });
      }
    });

    const result = new Map<string, PositionOutput>();

    groups.forEach((points) => {
      // Prioriza bolinhas maiores e riscos mais criticos para preservar leitura visual
      const ordered = [...points].sort((a, b) => {
        if (b.radius !== a.radius) return b.radius - a.radius;
        return b.score - a.score;
      });

      const placed: Array<{ x: number; y: number; radius: number }> = [];

      ordered.forEach((point) => {
        const chosen = choosePosition(point, placed);
        placed.push({ x: chosen.x, y: chosen.y, radius: point.radius });
        result.set(point.key, chosen);
      });
    });

    return result;
  }, [records, selectedCodes, view, matrixLayout, normalize]);

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
    const titleLines = splitRiskTitle(record.title, 36);
    const tw = 278;
    const th = 108;
    const txBase = x > matrixLayout.matrixLeft + matrixLayout.matrixPixelWidth / 2 ? x - tw - 18 : x + 18;
    const tx = Math.min(Math.max(txBase, 8), matrixLayout.svgWidth - tw - 8);
    const ty = Math.min(Math.max(y - 42, 8), matrixLayout.svgHeight - th - 8);

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

        <rect x={tx + 12} y={ty + 50} width="120" height="38" rx="8" fill="rgba(255,255,255,0.05)" />
        <rect x={tx + 146} y={ty + 50} width="120" height="38" rx="8" fill="rgba(255,255,255,0.05)" />

        <text x={tx + 72} y={ty + 63} textAnchor="middle" fontSize={7} fill="#94a3b8">Inerente</text>
        <text x={tx + 72} y={ty + 75} textAnchor="middle" fontSize={8.5} fontWeight="700" fill="#f8fafc">{record.inherentImpact.toFixed(3)} x {record.inherentProbability.toFixed(3)}</text>
        <text x={tx + 72} y={ty + 85} textAnchor="middle" fontSize={7} fill="#cbd5e1">Score: {inherentScore.toFixed(3)}</text>

        <text x={tx + 206} y={ty + 63} textAnchor="middle" fontSize={7} fill="#60a5fa">Residual</text>
        <text x={tx + 206} y={ty + 75} textAnchor="middle" fontSize={8.5} fontWeight="700" fill="#f8fafc">{record.residualImpact.toFixed(3)} x {record.residualProbability.toFixed(3)}</text>
        <text x={tx + 206} y={ty + 85} textAnchor="middle" fontSize={7} fill="#cbd5e1">Score: {residualScore.toFixed(3)}</text>

        <text x={tx + 14} y={ty + 101} fontSize={8} fontWeight="600" fill="#94a3b8">Mitigacao</text>
        <text x={tx + tw - 14} y={ty + 101} textAnchor="end" fontSize={8} fontWeight="700" fill="#4ade80">{mitigation.toFixed(1)}%</text>
      </g>
    );
  }, [hoveredRisk, matrixLayout]);

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
  const renderMatrixSVG = (mode: 'default' | 'fullscreen' = 'default') => {
    const svgClass = mode === 'fullscreen' ? 'block' : 'mx-auto h-auto w-full max-w-[760px] min-w-[520px]';
    return (
    <svg
      viewBox={`0 0 ${matrixLayout.svgWidth} ${matrixLayout.svgHeight}`}
      className={svgClass}
      style={mode === 'fullscreen' ? { width: `${matrixLayout.svgWidth}px`, height: `${matrixLayout.svgHeight}px` } : undefined}
    >
      <rect x="0" y="0" width={matrixLayout.svgWidth} height={matrixLayout.svgHeight} fill="#ffffff" />

      {/* Separadores sutis entre labels e células */}
      <line x1="86" y1="38" x2="86" y2={matrixLayout.separatorBottom} stroke="#e2e8f0" strokeWidth={1} />
      <line x1={matrixLayout.matrixLeft} y1={matrixLayout.separatorBottom} x2={matrixLayout.matrixRight + 2} y2={matrixLayout.separatorBottom} stroke="#e2e8f0" strokeWidth={1} />

      {/* Título PROBABILIDADE - vertical, extremo esquerdo */}
      <text x="11" y={matrixLayout.verticalTitleY} textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b" letterSpacing="1" transform={`rotate(-90 11 ${matrixLayout.verticalTitleY})`}>PROBABILIDADE</text>

      {/* Labels de probabilidade */}
      {matrixLayout.probabilityLabelCenters.map(({ label, cy }) => (
        <g key={label}>
          <rect x={28} y={cy - 9} width={72} height={18} rx={5} fill="#f1f5f9" transform={`rotate(-90 64 ${cy})`} />
          <text x={64} y={cy + 3.5} textAnchor="middle" fontSize="9.5" fill="#475569" fontWeight="500" transform={`rotate(-90 64 ${cy})`}>{label}</text>
        </g>
      ))}

      {/* Células da matriz */}
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 5 }).map((__, col) => (
          <rect
            key={`${row}-${col}`}
            x={matrixLayout.matrixLeft + col * matrixLayout.cellWidth}
            y={matrixLayout.matrixTop + row * matrixLayout.cellHeight}
            width={matrixLayout.cellWidth}
            height={matrixLayout.cellHeight}
            fill={getCellColor(col, row)}
            stroke="#ffffff"
            strokeWidth={3}
          />
        ))
      )}

      {/* Labels de impacto */}
      {matrixLayout.impactLabelCenters.map(({ label, cx }) => (
        <g key={label}>
          <rect x={cx - 37} y={matrixLayout.impactLabelsY} width={74} height={17} rx={5} fill="#f1f5f9" />
          <text x={cx} y={matrixLayout.impactLabelsTextY} textAnchor="middle" fontSize="9.5" fill="#475569" fontWeight="500">{label}</text>
        </g>
      ))}

      {/* Título IMPACTO - embaixo, centralizado */}
      <text x={matrixLayout.horizontalTitleX} y={matrixLayout.impactTitleY} textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b" letterSpacing="1">IMPACTO</text>

      {records.filter(r => selectedCodes.has(r.code)).map((record) => {
        const inherentPosition = positionedPointsByKey.get(`${record.id}:inherent`);
        const residualPosition = positionedPointsByKey.get(`${record.id}:residual`);

        const fallbackIx = matrixLayout.matrixLeft + normalize(record.inherentImpact) * matrixLayout.matrixPixelWidth;
        const fallbackIy = matrixLayout.matrixBottom - normalize(record.inherentProbability) * matrixLayout.matrixPixelHeight;
        const fallbackRx = matrixLayout.matrixLeft + normalize(record.residualImpact) * matrixLayout.matrixPixelWidth;
        const fallbackRy = matrixLayout.matrixBottom - normalize(record.residualProbability) * matrixLayout.matrixPixelHeight;

        const ix = inherentPosition?.x ?? fallbackIx;
        const iy = inherentPosition?.y ?? fallbackIy;
        const rx = residualPosition?.x ?? fallbackRx;
        const ry = residualPosition?.y ?? fallbackRy;

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
              <text x={rx} y={ry + 3} textAnchor="middle" fontSize={8} fontWeight="700" fill="#1e293b">{formatRiskCodeForDisplay(record.code)}</text>
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
            <text x={x} y={y + 3} textAnchor="middle" fontSize={8} fontWeight="700" fill="#ffffff">{formatRiskCodeForDisplay(record.code)}</text>
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
        <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-white">
          <div className="relative border-b border-slate-200 bg-white px-6 py-3 shadow-sm flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
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
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMatrixSizeControls((prev) => !prev)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Tamanho
                <span className="text-[11px] text-slate-400">{matrixWidth}×{matrixHeight}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Minimize size={13} />
                Sair
              </button>
            </div>

            {showMatrixSizeControls && (
              <div className="absolute right-6 top-full z-30 mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-lg">
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex-1 min-w-[170px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Largura da celula</span>
                    <input
                      type="range"
                      min={60}
                      max={520}
                      step={4}
                      value={matrixWidth}
                      onChange={(e) => setMatrixWidth(Number(e.target.value))}
                      className="w-full accent-brand-600"
                    />
                    <span className="mt-1 block text-xs text-slate-500">{matrixWidth}px</span>
                  </label>
                  <label className="flex-1 min-w-[170px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Altura da celula</span>
                    <input
                      type="range"
                      min={60}
                      max={520}
                      step={4}
                      value={matrixHeight}
                      onChange={(e) => setMatrixHeight(Number(e.target.value))}
                      className="w-full accent-brand-600"
                    />
                    <span className="mt-1 block text-xs text-slate-500">{matrixHeight}px</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixWidth(80);
                      setMatrixHeight(80);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Resetar
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-slate-50 p-4">
            <div className="flex min-h-full min-w-full items-center justify-center">
              {renderMatrixSVG('fullscreen')}
            </div>
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
              <li>Os dados sensiveis sao protegidos com criptografia AES-GCM antes de irem para o banco, reduzindo risco de exposicao mesmo em caso de acesso indevido aos registros brutos.</li>
              <li>A chave de descriptografia nao fica armazenada na tabela da matriz; ela fica separada no ambiente da aplicacao.</li>
              <li>Sem permissao (NONE), o usuario nao ve a opcao no menu, nao acessa a rota e o fluxo de leitura/descriptografia nao e executado para esse perfil.</li>
              <li>Apenas usuarios autorizados pelo Admin (READ/EDIT) passam pelas validacoes de acesso para visualizar os dados.</li>
              <li>Quando o sistema e acessado por HTTPS, o trafego entre navegador e servidor usa TLS com certificado digital valido (cadeado do navegador).</li>
            </ul>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">Saiba mais sobre o padrao criptografico</p>
              <ul className="mt-2 text-xs text-slate-600 space-y-1 list-disc pl-4">
                <li>
                  <a
                    href="https://csrc.nist.gov/pubs/fips/197/final"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    NIST FIPS 197 - AES (padrao oficial do algoritmo)
                  </a>
                </li>
                <li>
                  <a
                    href="https://csrc.nist.gov/pubs/sp/800/38/d/final"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    NIST SP 800-38D - GCM (modo autenticado do AES)
                  </a>
                </li>
                <li>
                  <a
                    href="https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    OWASP - Boas praticas de armazenamento criptografado
                  </a>
                </li>
              </ul>
            </div>
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

export const formatLocalDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateOnly = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

export const formatDateForDisplay = (
  dateStr: string,
  locale = 'pt-BR',
  options?: Intl.DateTimeFormatOptions
): string => parseDateOnly(dateStr).toLocaleDateString(locale, options);

export const normalizeDateValue = (value: unknown): string | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return formatLocalDate(value);
  }

  if (typeof value === 'string') {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }

  return null;
};

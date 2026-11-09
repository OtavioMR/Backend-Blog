/**
 * Utilitários para aferição e cálculo consistente de idade conforme fuso brasileiro (America/Sao_Paulo).
 * Evita desvios de fuso horário em conversões UTC vs horário local.
 */

export function parseBirthDateParts(
  birthDate: string | Date | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!birthDate) return null;

  let year: number;
  let month: number;
  let day: number;

  if (typeof birthDate === 'string') {
    const trimmed = birthDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const [y, m, d] = trimmed.split('-').map(Number);
    year = y;
    month = m;
    day = d;
  } else if (birthDate instanceof Date) {
    if (isNaN(birthDate.getTime())) return null;
    // Extrai no fuso UTC para instâncias de data padrão de colunas DATE
    year = birthDate.getUTCFullYear();
    month = birthDate.getUTCMonth() + 1;
    day = birthDate.getUTCDate();
  } else {
    return null;
  }

  // Validação estrita do calendário (evita 2000-02-30 virando março)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;

  return { year, month, day };
}

export function calculateAge(
  birthDate: string | Date | null | undefined,
  referenceDate: Date = new Date(),
  timeZone = 'America/Sao_Paulo',
): number | null {
  const parts = parseBirthDateParts(birthDate);
  if (!parts) return null;

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone }).format(referenceDate);
  const [ty, tm, td] = todayStr.split('-').map(Number);

  let age = ty - parts.year;
  if (tm < parts.month || (tm === parts.month && td < parts.day)) {
    age--;
  }

  return age;
}

export function isUserAdult(
  birthDate: string | Date | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  const age = calculateAge(birthDate, referenceDate);
  return age !== null && age >= 18;
}

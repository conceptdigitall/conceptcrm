export interface SanitizedPhoneResult {
  valid: boolean;
  hasWhatsApp: boolean;
  formatted?: string;
  reason?: string;
}

export interface ImportedContact {
  name: string;
  phone: string;
  service?: string;
  lastDate?: string;
  raw: Record<string, string>;
}

export interface InvalidRow {
  row: number;
  reason: string;
  raw: Record<string, string>;
}

export interface CsvImportSummary {
  totalRows: number;
  validContacts: ImportedContact[];
  invalidRows: InvalidRow[];
  duplicateCount: number;
  fixedLineCount: number;
}

export interface CsvImportOptions {
  existingPhones?: string[] | Set<string>;
}

const VALID_BRAZILIAN_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export function sanitizeBrazilianPhone(rawPhone: string): SanitizedPhoneResult {
  let digits = rawPhone.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return {
      valid: false,
      hasWhatsApp: false,
      reason: `Comprimento inválido (${digits.length} dígitos)`,
    };
  }

  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);

  if (!VALID_BRAZILIAN_DDDS.has(ddd)) {
    return {
      valid: false,
      hasWhatsApp: false,
      reason: `DDD inválido (${ddd})`,
    };
  }

  // 10 digits: DDD + 8 digits
  if (digits.length === 10) {
    const firstDigit = local[0];
    if (['6', '7', '8', '9'].includes(firstDigit)) {
      // Legacy mobile phone missing 9th digit -> Auto-insert 9 (Socratic Gate A1)
      return {
        valid: true,
        hasWhatsApp: true,
        formatted: `55${ddd}9${local}`,
      };
    }
    if (['2', '3', '4', '5'].includes(firstDigit)) {
      // Landline / fixed phone (Socratic Gate A1)
      return {
        valid: true,
        hasWhatsApp: false,
        formatted: `55${ddd}${local}`,
        reason: 'Número fixo (sem WhatsApp)',
      };
    }
    return {
      valid: false,
      hasWhatsApp: false,
      reason: 'Prefixo local desconhecido',
    };
  }

  // 11 digits: DDD + 9 digits
  if (digits.length === 11) {
    const ninthDigit = local[0];
    if (ninthDigit === '9') {
      return {
        valid: true,
        hasWhatsApp: true,
        formatted: `55${digits}`,
      };
    }
    return {
      valid: false,
      hasWhatsApp: false,
      reason: 'Celular de 9 dígitos não inicia com 9',
    };
  }

  return { valid: false, hasWhatsApp: false, reason: 'Formato não reconhecido' };
}

export function detectCsvDelimiter(csvContent: string): ',' | ';' | '\t' {
  const lines = csvContent.split(/\r?\n/).slice(0, 5);
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;

  for (const line of lines) {
    commas += (line.match(/,/g) || []).length;
    semicolons += (line.match(/;/g) || []).length;
    tabs += (line.match(/\t/g) || []).length;
  }

  if (semicolons > commas && semicolons > tabs) return ';';
  if (tabs > commas && tabs > semicolons) return '\t';
  return ',';
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());
  return values;
}

export function parseAndSanitizeCsv(
  csvText: string,
  options?: CsvImportOptions
): CsvImportSummary {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return {
      totalRows: 0,
      validContacts: [],
      invalidRows: [],
      duplicateCount: 0,
      fixedLineCount: 0,
    };
  }

  const delimiter = detectCsvDelimiter(csvText);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());

  // Header indices
  const nameIdx = headers.findIndex((h) =>
    /^(nome|name|cliente|paciente|contato)/i.test(h)
  );
  const phoneIdx = headers.findIndex((h) =>
    /^(telefone|celular|whatsapp|phone|tel|fone)/i.test(h)
  );
  const serviceIdx = headers.findIndex((h) =>
    /^(servico|serviço|procedimento|produto|area|área|ultimo_servico)/i.test(h)
  );
  const dateIdx = headers.findIndex((h) =>
    /^(data|data_visita|ultimo_atendimento|ultimo_agendamento|date|data_compra)/i.test(h)
  );

  const existingSet = new Set<string>();
  if (options?.existingPhones) {
    for (const p of options.existingPhones) {
      const sanitized = sanitizeBrazilianPhone(p);
      if (sanitized.formatted) {
        existingSet.add(sanitized.formatted);
      } else {
        existingSet.add(p.replace(/\D/g, ''));
      }
    }
  }

  const validContacts: ImportedContact[] = [];
  const invalidRows: InvalidRow[] = [];
  let duplicateCount = 0;
  let fixedLineCount = 0;

  for (let r = 1; r < lines.length; r++) {
    const rawValues = parseCsvLine(lines[r], delimiter);
    const rawRecord: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawRecord[h] = rawValues[i] ?? '';
    });

    const rawName = nameIdx >= 0 ? rawValues[nameIdx] : (rawValues[0] ?? '');
    const rawPhone = phoneIdx >= 0 ? rawValues[phoneIdx] : (rawValues[1] ?? '');
    const service = serviceIdx >= 0 ? rawValues[serviceIdx] : undefined;
    const lastDate = dateIdx >= 0 ? rawValues[dateIdx] : undefined;

    if (!rawName || !rawPhone) {
      invalidRows.push({
        row: r,
        reason: 'Nome ou telefone ausente',
        raw: rawRecord,
      });
      continue;
    }

    const phoneResult = sanitizeBrazilianPhone(rawPhone);

    if (!phoneResult.valid) {
      invalidRows.push({
        row: r,
        reason: phoneResult.reason ?? 'Telefone inválido',
        raw: rawRecord,
      });
      continue;
    }

    if (!phoneResult.hasWhatsApp) {
      fixedLineCount++;
      invalidRows.push({
        row: r,
        reason: phoneResult.reason ?? 'Número fixo (sem WhatsApp)',
        raw: rawRecord,
      });
      continue;
    }

    const formattedPhone = phoneResult.formatted!;

    if (existingSet.has(formattedPhone)) {
      duplicateCount++;
      continue;
    }

    // Add to seen set to prevent internal CSV duplicates
    existingSet.add(formattedPhone);

    validContacts.push({
      name: rawName,
      phone: formattedPhone,
      service,
      lastDate,
      raw: rawRecord,
    });
  }

  return {
    totalRows: lines.length - 1,
    validContacts,
    invalidRows,
    duplicateCount,
    fixedLineCount,
  };
}

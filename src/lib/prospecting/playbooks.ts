import { NicheKey } from '../../config/niches';
import {
  PlaybookTemplate,
  PlaybookField,
  PLAYBOOK_TEMPLATES,
} from './playbook-templates';

export type { PlaybookTemplate, PlaybookField };
export const ALL_PLAYBOOKS = PLAYBOOK_TEMPLATES;

export function getPlaybooksByNiche(niche: NicheKey): PlaybookTemplate[] {
  return PLAYBOOK_TEMPLATES.filter((t) => t.niche === niche);
}

export function getPlaybookById(
  templateId: string,
  niche?: NicheKey
): PlaybookTemplate | undefined {
  if (niche) {
    const found = PLAYBOOK_TEMPLATES.find(
      (t) => t.id === templateId && t.niche === niche
    );
    if (found) return found;
  }
  return PLAYBOOK_TEMPLATES.find((t) => t.id === templateId);
}

export function generatePlaybookCopy(
  templateId: string,
  variables: Record<string, string>,
  niche?: NicheKey
): string {
  const templateObj = getPlaybookById(templateId, niche);
  if (!templateObj) {
    return variables.Nome ? `Olá ${variables.Nome}, tudo bem?` : 'Olá, tudo bem?';
  }

  let text = templateObj.template;

  // Substitute supplied variables
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\[${key}\\]`, 'g');
    text = text.replace(regex, value.trim());
  }

  // Substitute default values for any missing variables defined in fields
  for (const field of templateObj.fields) {
    const regex = new RegExp(`\\[${field.key}\\]`, 'g');
    if (text.match(regex)) {
      text = text.replace(regex, field.defaultValue ?? '');
    }
  }

  // Clean any lingering bracketed tokens [Token]
  text = text.replace(/\[[A-Za-z0-9_]+\]/g, '').replace(/\s{2,}/g, ' ').trim();

  return text;
}

export function generateWhatsAppLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

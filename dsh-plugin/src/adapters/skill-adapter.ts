import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSkillRoot } from '../../../packages/director/skill';

/**
 * Skill adapter.
 *
 * The Harness loads `ai-commercial-video-director` through its own filesystem
 * skill provider (see `dsh-plugin/cordis.patch.yml`), so this adapter does not
 * reimplement skill discovery or loading. It exists to answer one question for
 * operators and tests: *will the Harness be able to discover the existing
 * skill, exactly as it is on disk?*
 *
 * It reuses `packages/director/skill#resolveSkillRoot`, which is the same
 * resolver the Director uses, so there is a single source of truth for where the
 * skill lives.
 */

/**
 * The public Harness skill-name grammar
 * (`@deepseek-ai/dsh-skill`, `SKILL_NAME`).
 */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Frontmatter fields the Harness filesystem provider reads. */
export interface HarnessSkillMetadata {
  name: string;
  description: string;
  whenToUse?: string;
}

export interface HarnessSkillDiscovery {
  /** Absolute skill directory (the directory-bundle root). */
  directory: string;
  /** Absolute path of the discovered `SKILL.md`. */
  skillFile: string;
  /** True when the Harness filesystem provider would accept this bundle. */
  discoverable: boolean;
  /** Reasons the bundle would be ignored, empty when discoverable. */
  problems: string[];
  metadata?: HarnessSkillMetadata;
}

/** Parse the leading YAML frontmatter block without pulling in a YAML parser. */
export function parseSkillFrontmatter(raw: string): Record<string, string> | undefined {
  if (!raw.startsWith('---')) return undefined;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return undefined;
  // Normalize line endings first: slicing on `\n---` leaves the final CR of a
  // CRLF file inside the block, which would make the last field unparseable.
  const block = raw.slice(raw.indexOf('\n', 3) + 1, end).replace(/\r\n?/g, '\n');
  const fields: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[match[1]] = value;
  }
  return fields;
}

/**
 * Report whether the Harness filesystem skill provider can discover the
 * existing Director skill bundle.
 */
export async function verifyHarnessSkill(skillDirectory = resolveSkillRoot()): Promise<HarnessSkillDiscovery> {
  const directory = path.resolve(skillDirectory);
  const skillFile = path.join(directory, 'SKILL.md');
  const problems: string[] = [];
  let metadata: HarnessSkillMetadata | undefined;

  let raw: string;
  try {
    raw = await readFile(skillFile, 'utf8');
  } catch {
    return { directory, skillFile, discoverable: false, problems: ['missing SKILL.md in the bundle directory'] };
  }

  const frontmatter = parseSkillFrontmatter(raw);
  if (!frontmatter) {
    problems.push('missing YAML frontmatter');
  } else {
    const name = frontmatter.name;
    const description = frontmatter.description;
    if (!name) problems.push('frontmatter requires name');
    else if (!SKILL_NAME.test(name)) problems.push(`invalid skill name "${name}" (kebab-case required)`);
    if (!description) problems.push('frontmatter requires description');
    if (name && description) {
      metadata = {
        name,
        description,
        ...(frontmatter.whenToUse ? { whenToUse: frontmatter.whenToUse } : {}),
      };
    }
  }

  return {
    directory,
    skillFile,
    discoverable: problems.length === 0,
    problems,
    ...(metadata ? { metadata } : {}),
  };
}

/** Canonical skill name the Harness advertises and loads. */
export const DIRECTOR_SKILL_NAME = 'ai-commercial-video-director';

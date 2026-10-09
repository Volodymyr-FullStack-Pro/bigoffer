import { describe, expect, it } from 'vitest';
import { detectRoleFamilies, detectRoleFamily, ROLE_FAMILIES, roleOffTarget, targetRoleFamilies } from './roles';

describe('detectRoleFamily', () => {
  it.each([
    ['Senior Full-Stack Engineer (React / Node)', 'fullstack'],
    ['Fullstack developer', 'fullstack'],
    ['Full-stack JS developer with backend focus (Security domain)', 'fullstack'],
    ['Фулстек розробник', 'fullstack'],
    ['Middle+ Frontend Developer, React', 'frontend'],
    ['Front-end Engineer', 'frontend'],
    ['React Developer', 'frontend'],
    ['Senior Vue.js Engineer', 'frontend'],
    ['Senior Backend Developer (Node.js + TypeScript)', 'backend'],
    ['Backend Engineer, Ops Engineering', 'backend'],
    ['Node.js Developer', 'backend'],
    ['Middle Python Engineer', 'backend'],
    ['Бекенд розробник', 'backend'],
    ['React Native Developer', 'mobile'],
    ['iOS Engineer', 'mobile'],
    ['DevOps Engineer', 'devops'],
    ['Site Reliability Engineer', 'devops'],
    ['QA Automation Engineer', 'qa'],
    ['Data Scientist', 'data'],
    ['Machine Learning Engineer', 'data'],
    ['Product Designer', 'design'],
    ['Engineering Manager', 'management'],
    ['Junior Illustrator', 'design'],
    ['Senior Technical Support Engineer', 'support'],
  ])('%s → %s', (title, family) => {
    expect(detectRoleFamily(title)).toBe(family);
  });

  it('returns null for generic titles', () => {
    expect(detectRoleFamily('Software Engineer')).toBeNull();
    expect(detectRoleFamily('Software Engineer, Product Infrastructure')).toBeNull();
    expect(detectRoleFamily('Senior Developer')).toBeNull();
  });

  it('falls back to the AI role when the title is generic', () => {
    expect(detectRoleFamily('Software Engineer II', 'Backend Developer')).toBe('backend');
    expect(detectRoleFamily('Software Engineer', 'Software Engineer')).toBeNull();
  });

  it('prefers the title over the AI role', () => {
    expect(detectRoleFamily('Frontend Developer', 'Backend Developer')).toBe('frontend');
  });
});

describe('detectRoleFamilies / roleOffTarget', () => {
  it('keeps every family a mixed title names', () => {
    expect(detectRoleFamilies('Senior React / React Native Developer')).toEqual(['mobile', 'frontend']);
  });
  it('is off-target only when no family is wanted', () => {
    expect(roleOffTarget(['mobile', 'frontend'], ['frontend', 'fullstack'])).toBe(false);
    expect(roleOffTarget(['backend'], ['frontend', 'fullstack'])).toBe(true);
    expect(roleOffTarget([], ['frontend'])).toBe(false);
    expect(roleOffTarget(['backend'], [])).toBe(false);
  });
});

describe('targetRoleFamilies', () => {
  it('uses explicit target roles', () => {
    expect(targetRoleFamilies({ targetRoles: ['backend'], keywords: ['full stack'] })).toEqual(['backend']);
  });
  it('derives targets from role keywords when none are set', () => {
    expect(targetRoleFamilies({ targetRoles: [], keywords: ['full stack', 'react', 'node.js', 'next.js', 'frontend'] }).sort()).toEqual([
      'frontend',
      'fullstack',
    ]);
  });
  it('is empty (no role filter) when keywords name no role', () => {
    expect(targetRoleFamilies({ targetRoles: [], keywords: ['typescript'] })).toEqual([]);
  });
  it('lists every family once', () => {
    expect(new Set(ROLE_FAMILIES).size).toBe(ROLE_FAMILIES.length);
  });
});

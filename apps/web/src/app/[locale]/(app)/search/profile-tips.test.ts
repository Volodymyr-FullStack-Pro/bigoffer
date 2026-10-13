import { describe, expect, it } from 'vitest';
import { profileTips } from './profile-tips';

const base = {
  keywords: ['full stack', 'frontend'],
  recommended: ['full-stack software engineer', 'full stack', 'react developer'],
  skills: ['React'],
  cvSkills: ['React', 'Docker'],
  roles: ['frontend'],
  remoteType: 'remote',
  locations: [],
  sources: new Set(['dou', 'djinni', 'robotaua']),
};

describe('profileTips', () => {
  it('suggests missing main boards, keywords, CV skills; spellings of a chosen word count as chosen', () => {
    expect(profileTips({ ...base, sources: new Set(['dou']) })).toEqual([
      { id: 'mainSources', items: ['Djinni', 'robota.ua'] },
      { id: 'keywords', items: ['full-stack software engineer', 'react developer'] },
      { id: 'cvSkills', items: ['Docker'] },
    ]);
  });
  it('asks for roles and cities when they matter', () => {
    const tips = profileTips({ ...base, roles: [], remoteType: 'hybrid', recommended: [], cvSkills: [] }).map((t) => t.id);
    expect(tips).toEqual(['roles', 'cities']);
  });
  it('is quiet for a complete profile', () => {
    expect(profileTips({ ...base, keywords: ['full-stack software engineer', 'full stack', 'react developer'], skills: ['React', 'Docker'] })).toEqual([]);
  });
});

describe('profileTips skills', () => {
  const base = { keywords: ['full stack developer'], recommended: [], roles: ['fullstack'], remoteType: 'remote', locations: [], sources: new Set(['dou', 'djinni', 'robotaua']) };
  it('treats compound and bracketed CV skills as present and suggests skills the matches ask for', () => {
    const tips = profileTips({
      ...base,
      skills: ['CSS', 'SASS', 'Model Context Protocol (MCP)', 'React'],
      cvSkills: ['CSS/SASS', 'MCP', 'React', 'OpenRouter'],
      demandSkills: ['React', 'GraphQL', 'OpenRouter', 'Docker'],
    });
    expect(tips).toEqual([
      { id: 'cvSkills', items: ['OpenRouter'] },
      { id: 'demandSkills', items: ['GraphQL', 'Docker'] },
    ]);
  });
});

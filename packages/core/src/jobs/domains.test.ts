import { describe, expect, it } from 'vitest';
import { detectDomains, detectPerks } from './domains';

describe('detectDomains', () => {
  it('flags army service', () => {
    expect(detectDomains({ title: 'Full Stack Developer', company: '1-й корпус НГУ «Азов»', descriptionText: '1-ий корпус Національної гвардії України «Азов» — військове формування, що входить до складу НГУ. Підрозділ збирає команду фахівців.' })[0]).toBe('military');
    expect(detectDomains({ title: 'React Developer', descriptionText: 'Третя окрема штурмова бригада шукає розробника. Служба за контрактом.' })[0]).toBe('military');
  });
  it('tells defence tech companies apart from army service', () => {
    expect(detectDomains({ title: 'Frontend Engineer', descriptionText: 'We build software for drones and UAV fleets. DefenseTech startup.' })).toContain('defense');
    expect(detectDomains({ title: 'Frontend Engineer', descriptionText: 'We build software for drones and UAV fleets. DefenseTech startup.' })).not.toContain('military');
  });
  it('does not read front-end as the front line', () => {
    expect(detectDomains({ title: 'Front-end developer', descriptionText: 'Фронтенд розробник, React, TypeScript.' })).not.toContain('military');
  });
  it('labels common fields', () => {
    expect(detectDomains({ title: 'Senior Full Stack', descriptionText: 'We are a fintech company building a neobank and payment processing.' })).toContain('fintech');
    expect(detectDomains({ title: 'Dev', descriptionText: 'iGaming platform, online casino and sportsbook.' })).toContain('gambling');
    expect(detectDomains({ title: 'Dev', descriptionText: 'E-commerce marketplace for sellers.' })).toContain('ecommerce');
    expect(detectDomains({ title: 'Dev', descriptionText: 'Outsourcing company. For our client from the US.' })).toContain('outsource');
  });
  it('stays quiet without evidence', () => {
    expect(detectDomains({ title: 'Frontend Developer', descriptionText: 'React, TypeScript, Tailwind. Remote.' })).toEqual([]);
  });
});

describe('detectPerks', () => {
  it('finds reservation from mobilisation, but not booking products', () => {
    expect(detectPerks({ title: 'Dev', descriptionText: 'Пропонуємо: бронювання від мобілізації, гнучкий графік.' })).toContain('reservation');
    expect(detectPerks({ title: 'Dev', descriptionText: 'Можливість бронювання для військовозобов’язаних.' })).toContain('reservation');
    expect(detectPerks({ title: 'Dev', descriptionText: 'Предоставляем отсрочку от мобилизации.' })).toContain('reservation');
    expect(detectPerks({ title: 'Dev', descriptionText: 'Розробка системи бронювання квитків та готелів.' })).not.toContain('reservation');
  });
  it('finds a test task, part-time and urgency', () => {
    expect(detectPerks({ title: 'Dev', descriptionText: 'Етапи: HR, тестове завдання, технічна співбесіда.' })).toContain('testTask');
    expect(detectPerks({ title: 'Part-time React developer', descriptionText: '' })).toContain('partTime');
    expect(detectPerks({ title: 'Dev', descriptionText: 'Workload: 20 hours per week.' })).toContain('partTime');
    expect(detectPerks({ title: 'Терміново! Frontend', descriptionText: '' })).toContain('urgent');
    expect(detectPerks({ title: 'Frontend', descriptionText: 'React, TypeScript.' })).toEqual([]);
  });
});

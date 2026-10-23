import type { z } from 'zod';
import { LlmInvalidOutputError, LlmUnavailableError } from './errors';
import type { GenerateJsonRequest, GenerateJsonResult, LlmClient, Sensitivity } from './types';

export type FakeRequest = GenerateJsonRequest<z.ZodType>;

/** Deterministic LlmClient for tests: `respond` returns the raw model output (validated by the request schema) or throws. */
export class FakeLlmClient implements LlmClient {
  readonly calls: FakeRequest[] = [];
  private readonly respond: (req: FakeRequest) => unknown;
  private readonly available: readonly Sensitivity[];

  constructor(respond: (req: FakeRequest) => unknown, available: readonly Sensitivity[] = ['public']) {
    this.respond = respond;
    this.available = available;
  }

  isAvailable(sensitivity: Sensitivity): boolean {
    return this.available.includes(sensitivity);
  }

  model(sensitivity: Sensitivity): string {
    return `fake-${sensitivity}`;
  }

  async generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>> {
    if (!this.isAvailable(req.sensitivity)) throw new LlmUnavailableError(req.sensitivity);
    this.calls.push(req);
    const raw = await this.respond(req);
    const usage = { requests: 1, inputTokens: 100, outputTokens: 50 };
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new LlmInvalidOutputError('fake output does not match the schema', JSON.stringify(raw), usage);
    return { data: parsed.data, usage, model: this.model(req.sensitivity) };
  }
}

/** Canned, schema-valid outputs per task for E2E runs (AI_PROVIDER=fake). Never used in production. */
export function fakeResponder(req: FakeRequest): unknown {
  switch (req.task) {
    case 'parse_cv':
      return {
        full_name: 'Test User',
        headline: 'Full Stack Developer',
        seniority: 'senior',
        years_experience: 6,
        skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
        locations: ['Kyiv'],
        languages: [{ language: 'English', level: 'B2' }],
        remote_preference: 'remote',
        summary: 'Full stack developer building web products.',
        experience: [{ company: 'Acme', title: 'Senior Developer', start: '2021', end: null, highlights: ['Built the payments platform'] }],
        contacts: { email: 'test.user@example.com', phone: null, linkedin: 'https://www.linkedin.com/in/test-user', github: null, portfolio: null, telegram: null },
      };
    case 'job_chat':
      return { answer: 'The team builds React dashboards; your Acme payments work fits. Brush up on GraphQL. [fake]' };
    case 'tailor_cv':
      return {
        lang: 'en',
        headline: 'Senior Full Stack Engineer [fake]',
        summary: 'Full stack developer with six years of React and Node.js. [fake]',
        skills: ['React', 'Node.js', 'GraphQL'],
        experience: [{ index: 0, bullets: [{ text: 'Built the payments platform in React and Node.js', change: 'reworded' }, { text: 'Designed GraphQL APIs', change: 'unverified' }] }],
      };
    case 'cover_letter':
      return { lang: 'en', cover_letter: 'Hello! I am a full stack developer with six years of React and Node.js. [fake]' };
    case 'apply_kit':
      return {
        lang: 'en',
        requirements: [
          { text: 'React', status: 'met', evidence: 'Built React dashboards at Acme' },
          { text: 'Kubernetes', status: 'missing', evidence: '' },
        ],
        pitch: ['Built React dashboards at Acme'],
        red_flags: ['Unpaid trial period'],
        cover_letter: 'Hello! I am a full stack developer with six years of React and Node.js. [fake]',
        short_message: 'Hi! Senior full stack dev, React/Node, 6 years. Happy to talk. [fake]',
        salary_hint: 'Ask for $4000–4500 per month. [fake]',
      };
    case 'classify_reply': {
      const text = req.prompt.toLowerCase();
      const none = { rejection_stage: null, rejection_reasons: [] };
      if (text.includes('calendly')) return { kind: 'interview_invite', interview_at: '2030-10-20T12:30', summary: 'Interview invite [fake]', recruiter_name: 'Galina', ...none };
      if (text.includes('not to move forward')) return { kind: 'rejection', interview_at: null, summary: 'Rejected [fake]', recruiter_name: null, rejection_stage: 'application', rejection_reasons: ['no_reason_given'] };
      if (text.includes('received your application')) return { kind: 'auto_reply', interview_at: null, summary: 'Automatic confirmation [fake]', recruiter_name: null, ...none };
      return { kind: 'question', interview_at: null, summary: 'The recruiter asks a question [fake]', recruiter_name: null, ...none };
    }
    case 'form_answers': {
      const count = [...req.prompt.matchAll(/^#(\d+) /gm)].length;
      return { items: Array.from({ length: count }, (_, i) => ({ n: i + 1, answer: `Fake answer ${i + 1}` })) };
    }
    case 'recruiter_message':
      return { subject: null, body: 'Hi! I saw your opening and would love to connect. [fake]' };
    case 'prep_plan':
      return {
        role: 'Middle Full-Stack Developer [fake]',
        summary: 'The team builds a SaaS platform. [fake]',
        expectations: ['Build React features', 'Design REST APIs in Node.js'],
        topics: [
          { title: 'React hooks', why: 'The UI is React.', from_job: true },
          { title: 'JavaScript event loop', why: 'Asked in most JS interviews.', from_job: false },
        ],
      };
    case 'prep_lesson':
      return {
        intro: 'Hooks let function components keep state. [fake]',
        concepts: [{ name: 'useState', explain: 'Keeps a value between renders.' }],
        examples: [{ title: 'A counter', explain: 'State that changes on click.', code: 'const [n, setN] = useState(0);', code_lang: 'tsx' }],
        pitfalls: ['Calling hooks inside conditions.'],
        questions: [{ q: 'Why can hooks not be called in a loop?', a: 'React matches hooks by call order.' }],
      };
    case 'prep_lesson_middle':
    case 'prep_lesson_senior': {
      const level = req.task === 'prep_lesson_middle' ? 'middle' : 'senior';
      return {
        intro: `At the ${level} level, types become a design tool. [fake ${level}]`,
        concepts: [{ name: `Utility types (${level})`, explain: 'Partial, Pick, Omit and Record build new types from existing ones.' }],
        examples: [{ title: 'A typed patch', explain: 'Only some fields may change.', code: 'type Patch = Partial<Pick<User, "name" | "email">>;', code_lang: 'ts' }],
        pitfalls: ['Deep conditional types slow the compiler.'],
        questions: [{ q: `A ${level} question`, a: 'A model answer.' }],
      };
    }
    case 'prep_pitch':
      return {
        intro: 'I am a full-stack developer with 3 years of React and Node.js. [fake]',
        points: [{ requirement: 'Build React features', answer: 'At Acme I built the dashboard in React. [fake]' }],
      };
    default:
      throw new Error(`fakeResponder: unknown task ${req.task ?? '(none)'}`);
  }
}

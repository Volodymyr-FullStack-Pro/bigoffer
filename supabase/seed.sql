insert into public.sources (id, name, kind, min_interval_minutes) values
  ('dou', 'DOU', 'rss', 60),
  ('djinni', 'Djinni', 'html', 120),
  ('workua', 'Work.ua', 'html', 180),
  ('robotaua', 'robota.ua', 'api', 120),
  ('jooble', 'Jooble', 'api', 120),
  ('remoteok', 'RemoteOK', 'api', 120),
  ('remotive', 'Remotive', 'api', 120),
  ('himalayas', 'Himalayas', 'api', 120),
  ('wwr', 'We Work Remotely', 'rss', 120),
  ('hn', 'HN Who''s Hiring', 'api', 1440),
  ('linkedin', 'LinkedIn (email alerts)', 'email', 0)
on conflict (id) do nothing;

insert into public.roles (slug, name, category) values
  ('fullstack-developer', '{"uk":"Full-Stack розробник","ru":"Full-Stack разработчик","en":"Full-Stack Developer"}', 'engineering'),
  ('frontend-developer', '{"uk":"Frontend розробник","ru":"Frontend разработчик","en":"Frontend Developer"}', 'engineering'),
  ('backend-developer', '{"uk":"Backend розробник","ru":"Backend разработчик","en":"Backend Developer"}', 'engineering'),
  ('qa-engineer', '{"uk":"QA інженер","ru":"QA инженер","en":"QA Engineer"}', 'engineering'),
  ('devops-engineer', '{"uk":"DevOps інженер","ru":"DevOps инженер","en":"DevOps Engineer"}', 'engineering'),
  ('product-manager', '{"uk":"Продакт-менеджер","ru":"Продакт-менеджер","en":"Product Manager"}', 'product'),
  ('ui-ux-designer', '{"uk":"UI/UX дизайнер","ru":"UI/UX дизайнер","en":"UI/UX Designer"}', 'design'),
  ('sales-manager', '{"uk":"Менеджер з продажу","ru":"Менеджер по продажам","en":"Sales Manager"}', 'sales'),
  ('marketing-manager', '{"uk":"Маркетолог","ru":"Маркетолог","en":"Marketing Manager"}', 'marketing'),
  ('hr-recruiter', '{"uk":"HR / Рекрутер","ru":"HR / Рекрутер","en":"HR / Recruiter"}', 'hr')
on conflict (slug) do nothing;

insert into public.skills (slug, name, aliases) values
  ('javascript', '{"en":"JavaScript"}', '{js,javascript,es6}'),
  ('typescript', '{"en":"TypeScript"}', '{ts,typescript}'),
  ('react', '{"en":"React"}', '{react,reactjs,react.js}'),
  ('nextjs', '{"en":"Next.js"}', '{next,nextjs,next.js}'),
  ('nodejs', '{"en":"Node.js"}', '{node,nodejs,node.js}'),
  ('nestjs', '{"en":"NestJS"}', '{nest,nestjs,nest.js}'),
  ('postgresql', '{"en":"PostgreSQL"}', '{postgres,postgresql,psql}'),
  ('mongodb', '{"en":"MongoDB"}', '{mongo,mongodb}'),
  ('tailwind', '{"en":"Tailwind CSS"}', '{tailwind,tailwindcss}'),
  ('playwright', '{"en":"Playwright"}', '{playwright}')
on conflict (slug) do nothing;

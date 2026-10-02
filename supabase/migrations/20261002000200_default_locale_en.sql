-- English is the product's default UI locale; uk/ru are chosen via the switcher or browser detection.
alter table public.profiles alter column locale set default 'en';

-- A public comment wall: anyone can post (optionally named) and like. Author replies are set directly in
-- the database; `hidden` takes a comment down without deleting it.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(body) between 1 and 300),
  nickname text check (length(nickname) between 1 and 20),
  author_reply text check (length(author_reply) <= 500),
  likes integer not null default 0 check (likes >= 0),
  hidden boolean not null default false,
  device_hash text,
  ip_hash text not null,
  submitted_on date not null,
  created_at timestamptz not null default now()
);
create index comments_visible_idx on public.comments (created_at desc) where not hidden;
create index comments_ip_day_idx on public.comments (ip_hash, submitted_on);

create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  device_hash text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, device_hash)
);

alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
revoke all on table public.comments, public.comment_likes from anon, authenticated;

-- Like or unlike a comment for one device; returns the new like count and whether it's now liked.
create or replace function public.toggle_comment_like(p_comment uuid, p_device_hash text) returns json
language plpgsql
set search_path = public
as $$
declare
  liked boolean;
  total integer;
begin
  if not exists (select 1 from comments where id = p_comment and not hidden) then
    return null;
  end if;
  delete from comment_likes where comment_id = p_comment and device_hash = p_device_hash;
  if found then
    liked := false;
  else
    insert into comment_likes (comment_id, device_hash) values (p_comment, p_device_hash);
    liked := true;
  end if;
  update comments set likes = (select count(*) from comment_likes where comment_id = p_comment)
  where id = p_comment returning likes into total;
  return json_build_object('likes', total, 'liked', liked);
end;
$$;

revoke all on function public.toggle_comment_like from public, anon, authenticated;

-- The first comments: feedback left through the form so far, with what's been done about it.
insert into public.comments (body, author_reply, ip_hash, submitted_on, created_at) values
  ('投资房还有租金收入这里没考虑进入哦', '已经加上了！投资房现在可以填每周租金，会从还款压力和利息压力里扣掉，谢谢提醒 🙏', 'seed', '2026-10-16', '2026-10-16 08:18:00+00'),
  ('希望可以加净资产对比（房产 + 投资）', '已加上「家庭净资产（估算）」排名：房产估值 − 贷款 + 存款 + 投资。有两位朋友都提了这个 🙌', 'seed', '2026-10-17', '2026-10-16 13:13:00+00'),
  ('想要利率变动提醒', '记下了～提醒需要留联系方式，我在想怎么做才不打扰大家，先收集一下需求。', 'seed', '2026-10-17', '2026-10-17 06:22:00+00');

CREATE TABLE admin_users (
  id integer,
  username text,
  password text,
);

CREATE TABLE badges (
  id integer,
  name text,
  description text,
  icon_url text,
);

CREATE TABLE favorites (
  user_id integer,
  game_id integer,
);

CREATE TABLE friend_requests (
  id integer,
  sender_id integer,
  receiver_id integer,
  created_at timestamp without time zone,
  accepted boolean,
);

CREATE TABLE friends (
  user_id integer,
  friend_id integer,
  created_at timestamp without time zone,
);

CREATE TABLE game_history (
  id integer,
  game_id integer,
  user_id integer,
  action text,
  note text,
  timestamp timestamp without time zone,
  returned_at timestamp without time zone,
  party_id integer,
  table_id text,
);

CREATE TABLE game_orders (
  id integer,
  game_id text,
  table_id text,
  created_at timestamp without time zone,
  first_name text,
  last_name text,
  phone text,
  user_id integer,
);

CREATE TABLE games (
  id integer,
  title_sv text,
  title_en text,
  description_sv text,
  description_en text,
  play_time text,
  age text,
  tags text,
  img text,
  rules text,
  lent_out boolean,
  slow_day_only boolean,
  trusted_only boolean,
  min_table_size integer,
  condition_rating integer,
  staff_picks text,
  times_lent integer,
  last_lent timestamp without time zone,
  min_players integer,
  max_players integer,
  members_only boolean,
  slug text,
);

CREATE TABLE notifications (
  id integer,
  user_id integer,
  type text,
  data jsonb,
  read boolean,
  created_at timestamp without time zone,
);

CREATE TABLE parties (
  id integer,
  name text,
  emoji text,
  invite_code text,
  created_by integer,
  created_at timestamp without time zone,
  is_active boolean,
  description text,
  avatar text,
);

CREATE TABLE party_members (
  id integer,
  party_id integer,
  user_id integer,
  joined_at timestamp without time zone,
  is_leader boolean,
  nickname text,
);

CREATE TABLE party_messages (
  id integer,
  party_id integer,
  user_id integer,
  content text,
  created_at timestamp without time zone,
);

CREATE TABLE party_session_members (
  session_id integer,
  user_id integer,
);

CREATE TABLE party_session_rounds (
  id integer,
  session_id integer,
  round_number integer,
  winners ARRAY,
  losers ARRAY,
  notes text,
);

CREATE TABLE party_session_rounds_new (
  id integer,
  session_id integer,
  round_number integer,
  winners ARRAY,
  losers ARRAY,
  notes text,
);

CREATE TABLE party_sessions (
  id integer,
  party_id integer,
  game_id integer,
  game_title text,
  created_by integer,
  started_at timestamp without time zone,
  notes text,
  return_notes text,
  returned_by_user_id integer,
  returned_at timestamp without time zone,
);

CREATE TABLE session_players (
  session_id integer,
  user_id integer,
  added_by integer,
);

CREATE TABLE user_badges (
  user_id integer,
  badge_id integer,
  awarded_at timestamp without time zone,
);

CREATE TABLE users (
  id integer,
  username text,
  password text,
  first_name text,
  last_name text,
  phone text,
  email text,
  id_number text,
  id_image_path text,
  archived boolean,
  avatar_url text,
  bio text,
  membership_status character varying,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  is_admin boolean,
);

CREATE TABLE wishlist (
  user_id integer,
  game_id integer
);


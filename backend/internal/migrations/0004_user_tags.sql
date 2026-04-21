CREATE TABLE IF NOT EXISTS user_tags (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS user_tags_tag_idx ON user_tags(tag_id);

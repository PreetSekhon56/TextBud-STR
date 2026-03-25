CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES owners(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'active', 'past_due', 'canceled', 'unpaid', 'trialing')),
  quantity INTEGER NOT NULL DEFAULT 1,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_owner
  ON subscriptions(owner_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON subscriptions(stripe_subscription_id);

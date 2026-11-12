-- Seed the default alert rules.
--
-- The trigger engine reads the rule for the type it is about to evaluate, and
-- there is one rule per type, so both rules are inserted here rather than
-- left for the administrator to create. An administrator can change the
-- threshold or the severity later; this is only the starting point.
--
-- The insert is idempotent so re-running the migration does not fail on the
-- unique index over `type`.
INSERT INTO "alert_rules" ("type", "enabled", "threshold_bytes", "severity")
VALUES
  ('unknown_device', true, NULL, 'warning'),
  ('high_usage', true, 5368709120, 'critical')
ON CONFLICT ("type") DO NOTHING;

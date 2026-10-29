import { Logger } from '@nestjs/common';
import type { Q } from './db.service';
import { Col, TABLES } from './tables';

/**
 * Schema is created and upgraded here on boot (idempotent). Bump SCHEMA_VERSION
 * and add a step to UPGRADES for any change after the first release.
 */
const SCHEMA_VERSION = 11;

const SAAS_DDL = [
  `CREATE TABLE IF NOT EXISTS meta (
    k VARCHAR(40) PRIMARY KEY,
    v VARCHAR(255) NOT NULL
  ) ENGINE=InnoDB`,

  // Accounting (server only, not synced). Sales, payments, purchases and the
  // rest are turned into ledger lines from their own rows at report time; these
  // tables hold the chart of accounts and the entries that exist only in
  // accounting (expenses, capital, transfers, opening balances, journals).
  `CREATE TABLE IF NOT EXISTS acc_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(160) NOT NULL,
    account_type VARCHAR(20) NOT NULL DEFAULT 'asset',
    is_system TINYINT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    UNIQUE KEY ux_acc_code (tenant_id, code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS acc_vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    kind VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    debit_code VARCHAR(10) NOT NULL,
    credit_code VARCHAR(10) NOT NULL,
    amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NOT NULL DEFAULT '',
    money_id INT NULL,
    to_id INT NULL,
    party VARCHAR(120) NOT NULL DEFAULT '',
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_accv_t (tenant_id, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Cash drawers, banks and wallets. Each rolls up to chart code 1001 (cash) or 1002 (bank);
  // `methods` lists the payment methods whose money lands in this account.
  `CREATE TABLE IF NOT EXISTS acc_money_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'bank',
    title VARCHAR(120) NOT NULL DEFAULT '',
    number VARCHAR(60) NOT NULL DEFAULT '',
    branch VARCHAR(120) NOT NULL DEFAULT '',
    opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    opening_date DATE NULL,
    methods VARCHAR(80) NOT NULL DEFAULT '',
    status TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_accm_t (tenant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // The cash drawer / bank / wallet a synced record (payment, supplier payment,
  // security refund) used, when chosen on the web. Records without one are
  // routed by their payment method, so phone records keep working.
  `CREATE TABLE IF NOT EXISTS acc_money_tags (
    tenant_id INT NOT NULL,
    ref_type VARCHAR(20) NOT NULL,
    uid VARCHAR(40) NOT NULL,
    money_id INT NOT NULL,
    PRIMARY KEY (tenant_id, ref_type, uid),
    INDEX ix_accg_m (money_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS acc_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    date DATE NOT NULL,
    account_id INT NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    description VARCHAR(255) NOT NULL DEFAULT '',
    ref_type VARCHAR(20) NOT NULL DEFAULT '',
    ref_id INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_acc_ref (tenant_id, ref_type, ref_id),
    INDEX ix_acc_acc (tenant_id, account_id, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    owner_name VARCHAR(120) NOT NULL DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '',
    address VARCHAR(255) NOT NULL DEFAULT '',
    currency VARCHAR(10) NOT NULL DEFAULT 'Rs',
    receipt_note VARCHAR(255) NOT NULL DEFAULT '',
    profile_updated_at BIGINT NOT NULL DEFAULT 0,
    logo MEDIUMTEXT NULL,
    logo_at BIGINT NOT NULL DEFAULT 0,
    plan VARCHAR(20) NOT NULL DEFAULT 'trial',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    mode VARCHAR(10) NOT NULL DEFAULT 'online',
    trial_ends_at DATETIME NULL,
    paid_until DATETIME NULL,
    lifetime TINYINT NOT NULL DEFAULT 0,
    seq BIGINT NOT NULL DEFAULT 0,
    no_s INT NOT NULL DEFAULT 0,
    no_p INT NOT NULL DEFAULT 0,
    no_r INT NOT NULL DEFAULT 0,
    admin_note TEXT NULL,
    last_active_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_tenants_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(160) NULL,
    email_verified_at DATETIME NULL,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'owner',
    is_super TINYINT NOT NULL DEFAULT 0,
    admin_perms TEXT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    last_login_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_users_phone (phone),
    UNIQUE KEY ux_users_email (email),
    INDEX ix_users_tenant (tenant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    client VARCHAR(20) NOT NULL DEFAULT 'web',
    device VARCHAR(120) NOT NULL DEFAULT '',
    ip VARCHAR(64) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sync_at DATETIME NULL,
    expires_at DATETIME NOT NULL,
    revoked TINYINT NOT NULL DEFAULT 0,
    UNIQUE KEY ux_sessions_token (token_hash),
    INDEX ix_sessions_user (user_id)
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS billing_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    plan VARCHAR(20) NOT NULL,
    months INT NOT NULL DEFAULT 1,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    method VARCHAR(20) NOT NULL,
    txn_ref VARCHAR(80) NOT NULL DEFAULT '',
    note VARCHAR(255) NOT NULL DEFAULT '',
    proof_files TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_by INT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    review_note VARCHAR(255) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_br_tenant (tenant_id),
    INDEX ix_br_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS plans (
    plan_key VARCHAR(20) PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    price INT NOT NULL DEFAULT 0,
    lifetime_price INT NOT NULL DEFAULT 0,
    users_limit INT NOT NULL DEFAULT 3,
    features TEXT NULL,
    is_active TINYINT NOT NULL DEFAULT 1,
    sort INT NOT NULL DEFAULT 0,
    mode VARCHAR(10) NOT NULL DEFAULT 'online',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS platform_settings (
    k VARCHAR(40) PRIMARY KEY,
    v TEXT NOT NULL,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_settings (
    id INT PRIMARY KEY,
    api_key_encrypted TEXT NULL,
    model VARCHAR(100) NULL,
    max_output_tokens INT NULL,
    thinking_budget INT NULL,
    voice_enabled TINYINT NOT NULL DEFAULT 0,
    voice_api_key_encrypted TEXT NULL,
    voice_name VARCHAR(100) NULL,
    voice_speed DECIMAL(3,2) NULL,
    live_enabled TINYINT NOT NULL DEFAULT 0,
    live_model VARCHAR(100) NULL,
    updated_by INT NULL,
    updated_by_name VARCHAR(255) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_conversations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope VARCHAR(16) NOT NULL DEFAULT 'platform',
    company_id BIGINT NULL,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    turns LONGTEXT NULL,
    message_count INT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX ix_aic_owner (scope, company_id, user_id, last_message_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_agent_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope VARCHAR(16) NOT NULL DEFAULT 'platform',
    company_id BIGINT NULL,
    user_id BIGINT NOT NULL,
    user_name VARCHAR(255) NULL,
    conversation_id BIGINT NULL,
    question TEXT NOT NULL,
    answer MEDIUMTEXT NULL,
    status VARCHAR(24) NOT NULL,
    model VARCHAR(64) NULL,
    turns_used SMALLINT NOT NULL DEFAULT 0,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    tool_calls LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_air_scope (scope, company_id, created_at),
    INDEX ix_air_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS billing_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    action VARCHAR(40) NOT NULL,
    detail VARCHAR(255) NOT NULL DEFAULT '',
    by_user INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_be_tenant (tenant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Phones registered to a shop. An Offline account may have one active phone.
  `CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    device_id VARCHAR(80) NOT NULL,
    user_id INT NULL,
    model VARCHAR(120) NOT NULL DEFAULT '',
    platform VARCHAR(20) NOT NULL DEFAULT 'android',
    app_version VARCHAR(20) NOT NULL DEFAULT '',
    status VARCHAR(12) NOT NULL DEFAULT 'active',
    first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME NULL,
    released_by INT NULL,
    UNIQUE KEY ux_devices (tenant_id, device_id),
    INDEX ix_devices_device (device_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Help requests from shops to the JGasFlow team, with a message thread.
  `CREATE TABLE IF NOT EXISTS support_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    created_by INT NULL,
    subject VARCHAR(120) NOT NULL,
    topic VARCHAR(20) NOT NULL DEFAULT 'other',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    last_from VARCHAR(10) NOT NULL DEFAULT 'shop',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_sr_tenant (tenant_id),
    INDEX ix_sr_status (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS support_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    tenant_id INT NOT NULL,
    user_id INT NULL,
    from_admin TINYINT NOT NULL DEFAULT 0,
    body TEXT NOT NULL,
    files TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_sm_request (request_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // One-time email codes: sign-up verification and password reset (only a hash is kept).
  `CREATE TABLE IF NOT EXISTS email_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(160) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    ip VARCHAR(64) NOT NULL DEFAULT '',
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_ec_email (email, purpose, id),
    INDEX ix_ec_ip (ip, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function colDdl(c: Col): string {
  const nul = c.nullable ? 'NULL' : 'NOT NULL';
  switch (c.kind) {
    case 'str':
      return `${c.name} VARCHAR(${c.len ?? 120}) NOT NULL DEFAULT ''`;
    case 'text':
      return `${c.name} TEXT NULL`;
    case 'int':
      return c.nullable ? `${c.name} INT NULL` : `${c.name} INT NOT NULL DEFAULT 0`;
    case 'money':
      return `${c.name} DECIMAL(14,2) NOT NULL DEFAULT 0`;
    case 'num':
      return `${c.name} DECIMAL(10,2) NOT NULL DEFAULT 0`;
    case 'bool':
      return `${c.name} TINYINT NOT NULL DEFAULT 1`;
    case 'date':
      return `${c.name} VARCHAR(19) ${nul}${c.nullable ? '' : " DEFAULT ''"}`;
    case 'uid':
      return `${c.name} VARCHAR(64) ${nul}`;
  }
}

function gasDdl(): string[] {
  return TABLES.map((t) => {
    const cols = [
      'id BIGINT AUTO_INCREMENT PRIMARY KEY',
      'tenant_id INT NOT NULL',
      'uid VARCHAR(64) NOT NULL',
      ...(t.doc ? ['no INT NULL'] : []),
      ...t.cols.map(colDdl),
      'version BIGINT NOT NULL DEFAULT 0',
      'updated_at BIGINT NOT NULL DEFAULT 0',
      'deleted TINYINT NOT NULL DEFAULT 0',
      'by_user INT NULL',
      `UNIQUE KEY ux_${t.name}_uid (tenant_id, uid)`,
      `INDEX ix_${t.name}_ver (tenant_id, version)`,
      ...(t.index ?? []).map((ix, k) => `INDEX ix_${t.name}_${k} (${ix.join(', ')})`),
    ];
    return `CREATE TABLE IF NOT EXISTS ${t.name} (\n  ${cols.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
  });
}

const UPGRADES: Record<number, string[]> = {
  // v2: platform admin permissions (NULL = every module).
  2: ['ALTER TABLE users ADD COLUMN admin_perms TEXT NULL AFTER is_super'],
  // v3: payment screenshots (support tables are created above with IF NOT EXISTS).
  3: ['ALTER TABLE billing_requests ADD COLUMN proof_files TEXT NULL AFTER note'],
  // v4: Offline and Online plans and shops (devices table is created above).
  4: [
    "ALTER TABLE plans ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'online' AFTER sort",
    "ALTER TABLE tenants ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'online' AFTER status",
    "UPDATE plans SET mode = 'any' WHERE plan_key = 'trial'",
  ],
  // v5: when the email was confirmed with a code (email_codes is created above).
  5: ['ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER email'],
  // v6: lifetime access (a one-time price per plan; the shop never expires).
  6: [
    'ALTER TABLE plans ADD COLUMN lifetime_price INT NOT NULL DEFAULT 0 AFTER price',
    'ALTER TABLE tenants ADD COLUMN lifetime TINYINT NOT NULL DEFAULT 0 AFTER paid_until',
  ],
  // v7: loose gas sold by kg from a big cylinder.
  7: [
    "ALTER TABLE cylinder_types ADD COLUMN unit VARCHAR(10) NOT NULL DEFAULT '' AFTER active",
    'ALTER TABLE sale_items ADD COLUMN kg DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount',
    'ALTER TABLE stock_moves ADD COLUMN kg_delta DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER ref',
  ],
  // v8: accounting entries name the cash/bank account they used.
  8: ['ALTER TABLE acc_vouchers ADD COLUMN money_id INT NULL AFTER note', 'ALTER TABLE acc_vouchers ADD COLUMN to_id INT NULL AFTER money_id'],
  // v9: loans name the person or bank (acc_money_tags is created above).
  9: ["ALTER TABLE acc_vouchers ADD COLUMN party VARCHAR(120) NOT NULL DEFAULT '' AFTER to_id"],
  // v10: the shop's own logo for receipts (a small image as a data URL).
  10: ['ALTER TABLE tenants ADD COLUMN logo MEDIUMTEXT NULL AFTER profile_updated_at', 'ALTER TABLE tenants ADD COLUMN logo_at BIGINT NOT NULL DEFAULT 0 AFTER logo'],
  // v11: other stock items (stoves, regulators...), cylinder colour and price, selling cylinders with gas or empty.
  11: [
    "ALTER TABLE cylinder_types ADD COLUMN category VARCHAR(60) NOT NULL DEFAULT '' AFTER unit",
    "ALTER TABLE cylinder_types ADD COLUMN color VARCHAR(20) NOT NULL DEFAULT '' AFTER category",
    'ALTER TABLE cylinder_types ADD COLUMN cyl_price DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER color',
    "ALTER TABLE sale_items ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT '' AFTER kg",
    "ALTER TABLE purchase_items ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT '' AFTER amount",
  ],
};

export async function migrate(q: Q) {
  const log = new Logger('Schema');
  for (const sql of [...SAAS_DDL, ...gasDdl()]) await q.run(sql);
  const row = await q.one<{ v: string }>("SELECT v FROM meta WHERE k = 'schema_version'");
  let current = row ? Number(row.v) : SCHEMA_VERSION;
  while (current < SCHEMA_VERSION) {
    current += 1;
    for (const sql of UPGRADES[current] ?? []) await q.run(sql);
    log.log(`Upgraded schema to v${current}`);
  }
  await q.run("INSERT INTO meta (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [String(SCHEMA_VERSION)]);
}

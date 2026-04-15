// lib/snowflake.js
// Snowflake connection using key-pair (JWT) authentication

const fs = require('fs');
const path = require('path');
const snowflake = require('snowflake-sdk');
const crypto = require('crypto');

function readPemRaw() {
  const keyPath = process.env.SF_PRIVATE_KEY_PATH;
  if (keyPath) {
    const resolved = path.resolve(keyPath);
    return fs.readFileSync(resolved, 'utf8');
  }
  return process.env.SF_PRIVATE_KEY || '';
}

/**
 * Parse PEM from env (literal \\n → newlines). OpenSSL 3 is strict; we normalize
 * and support PKCS#8 / PKCS#1 RSA; optional SF_PRIVATE_KEY_PASSPHRASE for encrypted keys.
 */
function getPrivateKeyPem() {
  const raw = readPemRaw();
  const pem = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!pem) {
    throw new Error(
      'SF_PRIVATE_KEY is not set. Add your Snowflake RSA private key PEM to the environment.',
    );
  }

  const passphrase = process.env.SF_PRIVATE_KEY_PASSPHRASE || '';

  let keyObj;
  try {
    if (passphrase) {
      keyObj = crypto.createPrivateKey({ key: pem, format: 'pem', passphrase });
    } else {
      keyObj = crypto.createPrivateKey(pem);
    }
  } catch (first) {
    throw new Error(
      `SF_PRIVATE_KEY could not be parsed (${first.code || first.message}). `
      + 'Use PEM: PKCS#8 (BEGIN PRIVATE KEY) or RSA (BEGIN RSA PRIVATE KEY). '
      + 'If the key is encrypted, set SF_PRIVATE_KEY_PASSPHRASE. '
      + 'Convert PKCS#1→PKCS#8: openssl pkcs8 -topk8 -nocrypt -in rsa_key.pem -out key_pkcs8.pem',
    );
  }

  return keyObj.export({ type: 'pkcs8', format: 'pem' });
}

let cachedPrivateKeyPem = null;

function getPrivateKey() {
  if (cachedPrivateKeyPem === null) {
    cachedPrivateKeyPem = getPrivateKeyPem();
  }
  return cachedPrivateKeyPem;
}

function getSnowflakeConfig() {
  return {
    account: process.env.SF_ACCOUNT,
    username: process.env.SF_USER,
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: getPrivateKey(),
    warehouse: process.env.SF_WAREHOUSE || 'COMPUTE_WH',
    role: process.env.SF_ROLE || 'PROD_SKYLINE_RW',
    database: process.env.SF_DATABASE || 'PROD_SKYLINE',
    schema: process.env.SF_SCHEMA || 'L20_CURATED',
  };
}

let connectionPool = null;

function createConnection() {
  return new Promise((resolve, reject) => {
    let conn;
    try {
      conn = snowflake.createConnection(getSnowflakeConfig());
    } catch (err) {
      console.error('Snowflake createConnection error:', err);
      reject(err);
      return;
    }
    conn.connect((err, c) => {
      if (err) {
        console.error('Snowflake connection error:', err);
        reject(err);
      } else {
        resolve(c);
      }
    });
  });
}

async function getConnection() {
  if (!connectionPool) {
    connectionPool = await createConnection();
  }
  if (!connectionPool.isUp()) {
    connectionPool = await createConnection();
  }
  return connectionPool;
}

async function executeQuery(sql, binds = []) {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          console.error('Query execution error:', err);
          connectionPool = null;
          reject(err);
        } else {
          resolve(rows || []);
        }
      },
    });
  });
}

module.exports = { executeQuery, getConnection };

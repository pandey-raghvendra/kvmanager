const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper ─────────────────────────────────────────────────────────────────
function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // az CLI writes some warnings to stderr that aren't fatal
        const msg = stderr || err.message;
        return reject({ error: msg.trim() });
      }
      try {
        resolve(stdout ? JSON.parse(stdout) : {});
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}

// ── Subscriptions ──────────────────────────────────────────────────────────
app.get('/api/subscriptions', async (req, res) => {
  try {
    const data = await run('az account list --output json');
    const subs = data.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state,
      isDefault: s.isDefault,
      tenantId: s.tenantId
    }));
    res.json(subs);
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Key Vaults ─────────────────────────────────────────────────────────────
app.get('/api/vaults/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const data = await run(
      `az keyvault list --subscription "${subscriptionId}" --output json`
    );
    const vaults = data.map(v => ({
      name: v.name,
      resourceGroup: v.resourceGroup,
      location: v.location,
      uri: v.properties?.vaultUri || `https://${v.name}.vault.azure.net/`
    }));
    res.json(vaults);
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── List Secrets (names only) ──────────────────────────────────────────────
app.get('/api/secrets/:vaultName', async (req, res) => {
  try {
    const { vaultName } = req.params;
    const data = await run(
      `az keyvault secret list --vault-name "${vaultName}" --output json`
    );
    const secrets = data.map(s => ({
      name: s.name,
      id: s.id,
      enabled: s.attributes?.enabled,
      created: s.attributes?.created,
      updated: s.attributes?.updated,
      contentType: s.contentType || ''
    }));
    res.json(secrets);
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Get Secret Value ───────────────────────────────────────────────────────
app.get('/api/secrets/:vaultName/:secretName/value', async (req, res) => {
  try {
    const { vaultName, secretName } = req.params;
    const data = await run(
      `az keyvault secret show --vault-name "${vaultName}" --name "${secretName}" --output json`
    );
    res.json({ value: data.value, contentType: data.contentType || '' });
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Set / Update Secret ────────────────────────────────────────────────────
app.put('/api/secrets/:vaultName/:secretName', async (req, res) => {
  try {
    const { vaultName, secretName } = req.params;
    const { value, contentType } = req.body;

    if (!value && value !== '') {
      return res.status(400).json({ error: 'value is required' });
    }

    // Escape single quotes in the value for shell safety
    const safeValue = value.replace(/'/g, "'\\''");
    const contentTypeFlag = contentType
      ? `--content-type "${contentType}"`
      : '';

    const data = await run(
      `az keyvault secret set --vault-name "${vaultName}" --name "${secretName}" --value '${safeValue}' ${contentTypeFlag} --output json`
    );

    res.json({
      name: data.name,
      id: data.id,
      contentType: data.contentType || ''
    });
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Delete Secret ──────────────────────────────────────────────────────────
app.delete('/api/secrets/:vaultName/:secretName', async (req, res) => {
  try {
    const { vaultName, secretName } = req.params;
    await run(
      `az keyvault secret delete --vault-name "${vaultName}" --name "${secretName}" --output json`
    );
    res.json({ success: true, message: `Secret "${secretName}" deleted (soft-delete — recoverable)` });
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Bulk Import ────────────────────────────────────────────────────────────
app.post('/api/secrets/:vaultName/bulk', async (req, res) => {
  try {
    const { vaultName } = req.params;
    const { secrets } = req.body; // Array of { name, value, contentType }

    if (!Array.isArray(secrets) || secrets.length === 0) {
      return res.status(400).json({ error: 'secrets array is required' });
    }

    const results = [];
    for (const secret of secrets) {
      try {
        const safeValue = secret.value.replace(/'/g, "'\\''");
        const contentTypeFlag = secret.contentType
          ? `--content-type "${secret.contentType}"`
          : '';
        await run(
          `az keyvault secret set --vault-name "${vaultName}" --name "${secret.name}" --value '${safeValue}' ${contentTypeFlag} --output json`
        );
        results.push({ name: secret.name, status: 'success' });
      } catch (err) {
        results.push({ name: secret.name, status: 'failed', error: err.error });
      }
    }

    res.json({ results });
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Copy Secrets Between Vaults ────────────────────────────────────────────
app.post('/api/copy', async (req, res) => {
  try {
    const { sourceVault, targetVault, secretNames } = req.body;

    if (!sourceVault || !targetVault || !Array.isArray(secretNames)) {
      return res.status(400).json({ error: 'sourceVault, targetVault, secretNames required' });
    }

    const results = [];
    for (const name of secretNames) {
      try {
        const data = await run(
          `az keyvault secret show --vault-name "${sourceVault}" --name "${name}" --output json`
        );
        const safeValue = data.value.replace(/'/g, "'\\''");
        const contentTypeFlag = data.contentType
          ? `--content-type "${data.contentType}"`
          : '';
        await run(
          `az keyvault secret set --vault-name "${targetVault}" --name "${name}" --value '${safeValue}' ${contentTypeFlag} --output json`
        );
        results.push({ name, status: 'success' });
      } catch (err) {
        results.push({ name, status: 'failed', error: err.error || String(err) });
      }
    }

    res.json({ results });
  } catch (e) {
    res.status(500).json(e);
  }
});

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const account = await run('az account show --output json');
    res.json({
      status: 'ok',
      loggedInAs: account.user?.name || 'unknown',
      currentSubscription: account.name
    });
  } catch {
    res.status(401).json({ status: 'error', message: 'az cli not logged in. Run: az login' });
  }
});

// ── Catch-all → serve index.html ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🔐 KV Manager running at http://localhost:${PORT}`);
  console.log(`   Make sure you're logged in: az login\n`);
});

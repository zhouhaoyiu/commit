const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-tests-'));
const repo = path.resolve(__dirname, '..');
const bash = process.env.BASH_BIN || 'bash';
const powershell = process.env.POWERSHELL_BIN || 'pwsh';
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
const gitconfig = path.join(root, 'gitconfig');
fs.writeFileSync(gitconfig, '[user]\nname = Commit Test\nemail = commit-test@example.invalid\n[commit]\ngpgsign = false\n[init]\ndefaultBranch = main\n');
Object.assign(env, { GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', POWERSHELL_TELEMETRY_OPTOUT: '1', POWERSHELL_UPDATECHECK: 'Off' });
after(() => fs.rmSync(root, { recursive: true, force: true }));

function run(command, args, cwd = root, check = true) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  if (check) assert.equal(result.status, 0, `${command} ${JSON.stringify(args)}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const git = (cwd, ...args) => run('git', args, cwd).stdout.trim();
let sequence = 0;
function fixture() {
  const parent = path.join(root, `case ${++sequence}`);
  fs.mkdirSync(parent);
  git(parent, 'init', '--bare', 'remote.git');
  git(parent, 'init', 'project');
  const cwd = path.join(parent, 'project');
  const remote = path.join(parent, 'remote.git');
  fs.writeFileSync(path.join(cwd, 'file.txt'), 'base\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'base');
  git(cwd, 'remote', 'add', 'origin', remote);
  git(cwd, 'push', '-u', 'origin', 'main');
  const base = git(cwd, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(cwd, 'file.txt'), 'changed\n');
  return { cwd, remote, base };
}
function invoke(engine, fixture, args, nativeMode = 'Standard') {
  const script = path.join(repo, engine === 'Bash' ? 'bin/commit.sh' : 'bin/commit.ps1');
  if (engine === 'Bash') return run(bash, [script.replace(/\\/g, '/'), ...args], fixture.cwd, false);
  // Splat real PowerShell arguments; do not let Windows native command-line
  // quoting consume embedded quotes or empty strings before the script sees them.
  const payload = Buffer.from(JSON.stringify({ script, args }), 'utf8').toString('base64');
  const command = `$PSNativeCommandArgumentPassing = '${nativeMode}'; $p = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))); $a = @($p.args); & $p.script @a; exit $LASTEXITCODE`;
  return run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], fixture.cwd, false);
}
function remoteHead(f) { return git(f.remote, 'rev-parse', 'refs/heads/main'); }
function body(f) { return run('git', ['log', '-1', '--format=%B'], f.cwd).stdout.replace(/[\r\n]+$/, ''); }
function unsigned(f) { assert.doesNotMatch(git(f.cwd, 'cat-file', 'commit', 'HEAD'), /^gpgsig /m); }
function unchanged(f) {
  assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.base);
  assert.equal(remoteHead(f), f.base);
  assert.equal(git(f.cwd, 'diff', '--cached', '--name-only'), '');
  assert.equal(fs.readFileSync(path.join(f.cwd, 'file.txt'), 'utf8'), 'changed\n');
}
function pendingCommit(f) {
  git(f.cwd, 'add', '.');
  git(f.cwd, 'commit', '-m', 'earlier unpublished commit');
  fs.writeFileSync(path.join(f.cwd, 'file.txt'), 'rejected new work\n');
  return git(f.cwd, 'rev-parse', 'HEAD');
}
function hook(cwd, name) {
  const file = path.join(cwd, 'hooks', name);
  fs.writeFileSync(file, '#!/bin/sh\nprintf "TEST_HOOK_REJECTED\\n" >&2\nexit 1\n', { mode: 0o755 });
}

// Fail explicitly if either runtime is missing: this suite must test both shells.
run(bash, ['--version']);
run(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']);
const key = path.join(root, 'signing-key');
run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'commit-test@example.invalid', '-f', key]);
const signers = path.join(root, 'allowed-signers');
fs.writeFileSync(signers, 'commit-test@example.invalid ' + fs.readFileSync(key + '.pub', 'utf8'));
function signing(f, configured = false) {
  git(f.cwd, 'config', 'gpg.format', 'ssh');
  git(f.cwd, 'config', 'user.signingkey', key);
  git(f.cwd, 'config', 'gpg.ssh.allowedSignersFile', signers);
  git(f.cwd, 'config', 'commit.gpgSign', String(configured));
}

for (const engine of ['Bash', 'PowerShell']) {
  test(`${engine}: queries leave the index, working tree, commits and remote unchanged`, () => {
    const f = fixture();
    for (const flag of ['-h', '--help', '-v', '--version', '-a', '--author']) {
      const result = invoke(engine, f, [flag]);
      assert.equal(result.status, 0, result.stderr);
      if (flag === '-v' || flag === '--version') assert.match(result.stdout, /Version: 1\.0\.0/);
      unchanged(f);
    }
  });

  const messageCases = [
    { name: 'quoted whitespace, glob, quotes and Unicode', args: ['-ns', '-np', '-m', 'fix  * [a-z]? "quotes" \'single\' \\path $literal 中文'], message: 'fix  * [a-z]? "quotes" \'single\' \\path $literal 中文' },
    { name: 'option-like text with switches after -m', args: ['-m', 'docs: explain -h -v -np flags', '-ns', '-np'], message: 'docs: explain -h -v -np flags' },
    { name: 'multiline message', args: ['--no-push', '--no-sign', '--message', 'title\n\nbody: preserve  spacing'], message: 'title\n\nbody: preserve  spacing' },
    { name: 'equals message', args: ['-np', '--message=-h'], message: '-h' },
    { name: 'quoted positional message', args: ['-ns', '-np', 'fix  login'], message: 'fix  login' },
    { name: 'multiple positional arguments', args: ['-ns', 'fix', 'login', '-np'], message: 'fix login' },
    { name: 'end of options', args: ['-np', '--', '-m', '-h', 'body'], message: '-m -h body' },
    { name: 'message consumes one option-like argument', args: ['-np', '-m', '--signoff'], message: '--signoff' },
    { name: 'default message', args: ['-np'], message: 'some changes' }
  ];
  for (const c of messageCases) test(`${engine}: ${c.name}`, () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.cwd, 'another.txt'), 'glob candidate\n');
    const result = invoke(engine, f, c.args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(body(f), c.message);
    assert.equal(remoteHead(f), f.base);
    unsigned(f);
  });

  test(`${engine}: invalid arguments fail before staging or committing`, () => {
    for (const args of [['-m'], ['-m', ''], ['--message='], ['-m', '  \n'], ['--unknown'], ['-m', 'first', '-m', 'second'], ['-m', 'explicit', 'positional']]) {
      const f = fixture();
      const result = invoke(engine, f, args);
      assert.equal(result.status, 2, JSON.stringify(args) + result.stderr);
      unchanged(f);
    }
  });

  for (const noPush of [false, true]) test(`${engine}: rejected commits stop with failure (no-push=${noPush})`, () => {
    const f = fixture();
    const pending = pendingCommit(f);
    hook(path.join(f.cwd, '.git'), 'pre-commit');
    const result = invoke(engine, f, ['-ns', ...(noPush ? ['-np'] : []), '-m', 'must not be committed']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEST_HOOK_REJECTED/);
    assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), pending);
    assert.equal(remoteHead(f), f.base, 'An earlier local commit must not be pushed');
  });

  test(`${engine}: failed staging cannot push earlier commits`, () => {
    const f = fixture();
    const pending = pendingCommit(f);
    fs.writeFileSync(path.join(f.cwd, '.git/index.lock'), 'locked');
    const result = invoke(engine, f, ['-ns', '-m', 'blocked by index lock']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /index.lock/);
    assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), pending);
    assert.equal(remoteHead(f), f.base);
  });

  test(`${engine}: successful default push updates the local test remote`, () => {
    const f = fixture();
    const result = invoke(engine, f, ['-ns', '-m', 'published in local test only']);
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(remoteHead(f), f.base);
    assert.equal(remoteHead(f), git(f.cwd, 'rev-parse', 'HEAD'));
  });

  test(`${engine}: push rejection returns failure and keeps the new local commit`, () => {
    const f = fixture();
    hook(f.remote, 'pre-receive');
    const result = invoke(engine, f, ['-ns', '-m', 'remote will reject']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEST_HOOK_REJECTED/);
    assert.notEqual(git(f.cwd, 'rev-parse', 'HEAD'), f.base);
    assert.equal(remoteHead(f), f.base);
  });

  for (const args of [['--sign'], ['-s'], ['--no-sign', '--sign'], []]) test(`${engine}: real SSH signature verifies (${args.length ? args.join(' ') : 'Git configuration'})`, () => {
    const f = fixture();
    signing(f, args.length === 0);
    const result = invoke(engine, f, ['-np', ...args, '-m', 'cryptographically signed']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(git(f.cwd, 'cat-file', 'commit', 'HEAD'), /^gpgsig -----BEGIN SSH SIGNATURE-----/m);
    git(f.cwd, 'verify-commit', 'HEAD');
  });

  for (const args of [['-ns'], ['--no-sign'], ['--sign', '-ns']]) test(`${engine}: ${args.join(' ')} overrides signing configuration`, () => {
    const f = fixture();
    signing(f, true);
    git(f.cwd, 'config', 'user.signingkey', path.join(root, 'nonexistent-key'));
    const result = invoke(engine, f, ['-np', ...args, '-m', 'unsigned even without a key']);
    assert.equal(result.status, 0, result.stderr);
    unsigned(f);
    assert.equal(body(f), 'unsigned even without a key');
  });

  test(`${engine}: signature failure stops before pushing`, () => {
    const f = fixture();
    const pending = pendingCommit(f);
    signing(f);
    git(f.cwd, 'config', 'user.signingkey', path.join(root, 'nonexistent-key'));
    const result = invoke(engine, f, ['--sign', '-m', 'signing must fail']);
    assert.notEqual(result.status, 0);
    assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), pending);
    assert.equal(remoteHead(f), f.base);
  });

  test(`${engine}: signoff is independent of cryptographic signing`, () => {
    const f = fixture();
    const result = invoke(engine, f, ['-np', '-ns', '--signoff', '-m', 'with signoff']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(body(f), 'with signoff\n\nSigned-off-by: Commit Test <commit-test@example.invalid>');
    unsigned(f);
    fs.writeFileSync(path.join(f.cwd, 'file.txt'), 'next change\n');
    const next = invoke(engine, f, ['-np', '--signoff', '--no-signoff', '-m', 'without signoff']);
    assert.equal(next.status, 0, next.stderr);
    assert.equal(body(f), 'without signoff');
  });
}

test('PowerShell: legacy native argument passing preserves the commit message', () => {
  const f = fixture();
  const message = 'legacy  * "quotes" 中文 \\path';
  const result = invoke('PowerShell', f, ['-np', '-ns', '-m', message], 'Legacy');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body(f), message);
  assert.equal(remoteHead(f), f.base);
});

test('PowerShell: direct -File entry point commits without pushing', () => {
  const f = fixture();
  const message = 'direct invocation';
  const result = run(powershell, ['-NoProfile', '-NonInteractive', '-File', path.join(repo, 'bin/commit.ps1'), '-np', '-ns', '-m', message], f.cwd, false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body(f), message);
  assert.equal(remoteHead(f), f.base);
});

test('legacy bin/commit forwards arguments to the fixed Bash implementation', () => {
  const f = fixture();
  const message = 'legacy  * -h "literal"';
  const result = run(bash, [path.join(repo, 'bin/commit').replace(/\\/g, '/'), '-np', '-ns', '-m', message], f.cwd, false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body(f), message);
  assert.equal(remoteHead(f), f.base);
});
